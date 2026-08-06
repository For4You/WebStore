--- /mnt/data/store.original.js	2026-08-06 20:52:04.950040365 +0000
+++ /mnt/data/store.js	2026-08-06 20:56:36.152964325 +0000
@@ -4,13 +4,20 @@
   const SUPABASE_URL = "https://lscxhleqiflsrncqguqa.supabase.co";
   const SUPABASE_PUBLISHABLE_KEY =
     "sb_publishable_qFQklwHy5GULsEoudPrG4A_3OZQLqBy";
-  const client = window.supabase.createClient(
-    SUPABASE_URL,
-    SUPABASE_PUBLISHABLE_KEY,
-    {
-      auth: { persistSession: true, autoRefreshToken: true },
-    },
-  );
+  let client = null;
+  try {
+    if (window.supabase?.createClient) {
+      client = window.supabase.createClient(
+        SUPABASE_URL,
+        SUPABASE_PUBLISHABLE_KEY,
+        {
+          auth: { persistSession: true, autoRefreshToken: true },
+        },
+      );
+    }
+  } catch (error) {
+    console.error("تعذر تهيئة Supabase", error);
+  }
   const storageImagePrefix = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
   const categoryLabels = {
     kitchen: "المطبخ",
@@ -28,8 +35,20 @@
       return fallback;
     }
   };
+  const saveLocalJSON = (key, value) => {
+    try {
+      localStorage.setItem(key, JSON.stringify(value));
+      return true;
+    } catch (_) {
+      return false;
+    }
+  };
   const format = (number) =>
     new Intl.NumberFormat("ar-DZ").format(Number(number) || 0);
+  const formatOrderPrice = (number) =>
+    new Intl.NumberFormat("ar-DZ", { useGrouping: false }).format(
+      Number(number) || 0,
+    );
   const twoArabicDigits = (number) =>
     String(Math.max(0, Math.floor(Number(number) || 0)))
       .padStart(2, "0")
@@ -46,20 +65,64 @@
           "'": "&#039;",
         })[character],
     );
-  const safeImage = (value) =>
-    String(value || "").startsWith(storageImagePrefix) ? String(value) : "";
+  const normalizeArray = (value) => {
+    if (Array.isArray(value)) return value;
+    if (typeof value !== "string" || !value.trim()) return [];
+    try {
+      const parsed = JSON.parse(value);
+      if (Array.isArray(parsed)) return parsed;
+    } catch (_) {}
+    return value.split(/[,،\n]/);
+  };
+  const cleanTextArray = (value) =>
+    normalizeArray(value)
+      .map((item) => String(item ?? "").trim())
+      .filter((item, index, array) => item && array.indexOf(item) === index);
+  const safeImage = (value) => {
+    const source = String(value || "").trim();
+    if (source.startsWith(storageImagePrefix)) return source;
+    const relativePrefix = "/storage/v1/object/public/product-images/";
+    if (source.startsWith(relativePrefix)) return `${SUPABASE_URL}${source}`;
+    return "";
+  };
   const safeImages = (product) => {
-    const values = Array.isArray(product?.images)
-      ? product.images
-      : [product?.image];
+    const values = [
+      ...normalizeArray(product?.images),
+      product?.image,
+      product?.imageUrl,
+    ];
     return values
       .map(safeImage)
       .filter((value, index, array) => value && array.indexOf(value) === index)
       .slice(0, 8);
   };
+  const safePosition = (value) => {
+    const position = String(value || "center").trim().toLowerCase();
+    return /^(?:(?:left|center|right|top|bottom)|(?:\d{1,3}(?:\.\d+)?%))(?:\s+(?:(?:left|center|right|top|bottom)|(?:\d{1,3}(?:\.\d+)?%)))?$/.test(
+      position,
+    )
+      ? position
+      : "center";
+  };
+  const normalizeSearch = (value) =>
+    String(value || "")
+      .trim()
+      .toLocaleLowerCase("ar")
+      .normalize("NFKD")
+      .replace(/[\u064B-\u065F\u0670]/g, "")
+      .replace(/[أإآ]/g, "ا")
+      .replace(/ى/g, "ي")
+      .replace(/ة/g, "ه")
+      .replace(/\s+/g, " ");
 
   let products = [];
+  let productsLoaded = false;
   let cart = localJSON("dar-cart", {});
+  if (!cart || typeof cart !== "object" || Array.isArray(cart)) cart = {};
+  const storedFavorites = localJSON("dar-favorites", []);
+  let favorites = new Set(
+    (Array.isArray(storedFavorites) ? storedFavorites : []).map(String),
+  );
   let activeProduct = null;
   const orderDrafts = new Map();
   let galleryImages = [];
@@ -77,40 +140,46 @@
   let featuredIndex = 0;
   let featuredTimer;
   let featuredUpdateTimer;
+  let realtimeChannel = null;
   const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
+  let storedTheme = null;
+  try {
+    storedTheme = localStorage.getItem("dar-theme");
+  } catch (_) {}
   let theme =
-    localStorage.getItem("dar-theme") ||
+    storedTheme ||
     (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
 
   function productFromDb(row) {
-    const images = Array.isArray(row.images)
-      ? row.images.filter(safeImage).slice(0, 8)
-      : [];
+    const images = safeImages({
+      images: row.images,
+      image: row.image || row.image_url,
+    });
     return {
       id: row.id,
-      name: row.name,
-      price: Number(row.price),
-      oldPrice: Number(row.old_price),
-      category: row.category,
-      description: row.description || "",
-      badge: row.badge || "",
-      stock: Number(row.stock),
-      sizes: row.sizes || [],
-      colors: row.colors || [],
+      name: String(row.name || "منتج بدون اسم").trim(),
+      price: Math.max(0, Number(row.price) || 0),
+      oldPrice: Math.max(0, Number(row.old_price) || 0),
+      category: String(row.category || "kitchen"),
+      description: String(row.description || ""),
+      badge: String(row.badge || ""),
+      stock: Math.max(0, Math.floor(Number(row.stock) || 0)),
+      sizes: cleanTextArray(row.sizes),
+      colors: cleanTextArray(row.colors),
       visible: row.visible !== false,
       featured: row.featured === true,
       featuredOrder: Number(row.featured_order) || 0,
       images,
       image: images[0] || "",
-      pos: row.image_position || "center",
-      code: row.code || "",
+      pos: safePosition(row.image_position),
+      code: String(row.code || ""),
     };
   }
 
   function showcaseFromDb(row) {
     return {
       id: row.id,
-      image: safeImage(row.image_url),
+      image: safeImage(row.image_url || row.image),
       title: row.title || "أفكار للمطبخ والمائدة",
       subtitle: row.subtitle || "صور نختارها لتساعدك على تنسيق بيتك بطريقة بسيطة",
       displayOrder: Number(row.display_order) || 1,
@@ -118,20 +187,27 @@
   }
 
   function toast(message) {
-    $("#toastText").textContent = message;
-    $("#toast").hidden = false;
+    const node = $("#toast");
+    const text = $("#toastText");
+    if (!node || !text) return;
+    text.textContent = message;
+    node.hidden = false;
     clearTimeout(toastTimer);
-    toastTimer = setTimeout(() => ($("#toast").hidden = true), 3000);
+    toastTimer = setTimeout(() => (node.hidden = true), 3200);
   }
 
   function setTheme(nextTheme) {
-    theme = nextTheme;
-    document.documentElement.dataset.theme = nextTheme;
-    localStorage.setItem("dar-theme", nextTheme);
-    $("#themeSymbol").textContent = nextTheme === "dark" ? "☀" : "☾";
+    theme = nextTheme === "dark" ? "dark" : "light";
+    document.documentElement.dataset.theme = theme;
+    try {
+      localStorage.setItem("dar-theme", theme);
+    } catch (_) {}
+    const symbol = $("#themeSymbol");
+    if (symbol) symbol.textContent = theme === "dark" ? "☀" : "☾";
     updateFeaturedProduct();
-    document.querySelector('meta[name="theme-color"]').content =
-      nextTheme === "dark" ? "#071e19" : "#f6efe6";
+    const themeMeta = document.querySelector('meta[name="theme-color"]');
+    if (themeMeta)
+      themeMeta.content = theme === "dark" ? "#071e19" : "#f6efe6";
   }
 
   function featuredCandidates() {
@@ -247,6 +323,9 @@
   }
 
   function openCart() {
+    $("#nav")?.classList.remove("open");
+    if ($("#searchBar")) $("#searchBar").hidden = true;
+    updateCart();
     $("#drawer").classList.add("open");
     $("#overlay").hidden = false;
     setLocked(true);
@@ -259,6 +338,7 @@
   }
 
   function cleanCart() {
+    if (!productsLoaded) return;
     Object.keys(cart).forEach((id) => {
       const product = products.find((item) => String(item.id) === String(id));
       if (
@@ -278,27 +358,41 @@
 
   function updateCart() {
     cleanCart();
-    localStorage.setItem("dar-cart", JSON.stringify(cart));
+    saveLocalJSON("dar-cart", cart);
     const count = Object.values(cart).reduce(
-      (sum, quantity) => sum + quantity,
+      (sum, quantity) => sum + Math.max(0, Number(quantity) || 0),
       0,
     );
+    const cartCount = $("#cartCount");
+    const drawerTitle = $("#drawerTitle");
+    const drawerItems = $("#drawerItems");
+    const drawerTotal = $("#drawerTotal");
+    if (!cartCount || !drawerTitle || !drawerItems || !drawerTotal) return;
+    cartCount.textContent = count;
+    cartCount.hidden = !count;
+    drawerTitle.textContent = count
+      ? `${format(count)} قطع مختارة`
+      : "السلة فارغة";
+
+    if (!productsLoaded && count) {
+      drawerItems.innerHTML =
+        '<div class="empty"><span>…</span><p>جاري تحميل تفاصيل سلّتك.</p></div>';
+      drawerTotal.hidden = true;
+      return;
+    }
+
     const items = products.filter(
       (product) =>
         cart[product.id] &&
         product.visible !== false &&
         Number(product.stock || 0) > 0,
     );
-    $("#cartCount").textContent = count;
-    $("#cartCount").hidden = !count;
-    $("#drawerTitle").textContent = count
-      ? `${format(count)} قطع مختارة`
-      : "السلة فارغة";
     if (!items.length) {
-      $("#drawerItems").innerHTML =
+      drawerItems.innerHTML =
         '<div class="empty"><span>♧</span><p>لم تضيفي أي قطعة بعد.</p><button id="start">ابدئي التسوق</button></div>';
-      $("#drawerTotal").hidden = true;
-      $("#start").onclick = closeCart;
+      drawerTotal.hidden = true;
+      const start = $("#start");
+      if (start) start.onclick = closeCart;
       return;
     }
     $("#drawerItems").innerHTML = items
@@ -307,10 +401,10 @@
         const imageStyle = image
           ? `--product-image:url('${image.replace(/'/g, "%27")}')`
           : "";
-        return `<div class="drawer-item"><div class="drawer-thumb" data-category="${esc(product.category)}" style="--pos:${esc(product.pos || "center")};${imageStyle}"></div><div><h3>${esc(product.name)}</h3><strong>${format(product.price)} دج</strong><div class="qty"><button data-id="${esc(product.id)}" data-step="-1">−</button><span>${format(cart[product.id])}</span><button data-id="${esc(product.id)}" data-step="1">+</button></div></div></div>`;
+        return `<div class="drawer-item"><div class="drawer-thumb" data-category="${esc(product.category)}" style="--pos:${safePosition(product.pos)};${imageStyle}"></div><div><h3>${esc(product.name)}</h3><strong>${format(product.price)} دج</strong><div class="qty"><button data-id="${esc(product.id)}" data-step="-1">−</button><span>${format(cart[product.id])}</span><button data-id="${esc(product.id)}" data-step="1">+</button></div></div></div>`;
       })
       .join("");
-    $$("[data-step]").forEach((button) => {
+    $$("#drawerItems [data-step]").forEach((button) => {
       button.onclick = () => {
         const id = button.dataset.id;
         const product = products.find((item) => String(item.id) === String(id));
@@ -335,7 +429,7 @@
 
   function productImageStyle(product) {
     const image = safeImages(product)[0];
-    return `--pos:${esc(product.pos || "center")};${image ? `--product-image:url('${image.replace(/'/g, "%27")}')` : ""}`;
+    return `--pos:${safePosition(product.pos)};${image ? `--product-image:url('${image.replace(/'/g, "%27")}')` : ""}`;
   }
 
   function renderProducts(loading = false) {
@@ -344,12 +438,17 @@
         '<div class="store-empty"><div><strong>جاري تحميل المنتجات…</strong><span>لحظات وتظهر أحدث المنتجات والمخزون.</span></div></div>';
       return;
     }
-    const visible = products.filter(
-      (product) =>
+    const searchTerm = normalizeSearch(currentSearch);
+    const visible = products.filter((product) => {
+      const haystack = normalizeSearch(
+        `${product.name} ${product.description} ${product.code} ${categoryLabels[product.category] || product.category}`,
+      );
+      return (
         product.visible !== false &&
         (currentFilter === "all" || product.category === currentFilter) &&
-        (!currentSearch || String(product.name).includes(currentSearch)),
-    );
+        (!searchTerm || haystack.includes(searchTerm))
+      );
+    });
     if (!visible.length) {
       $("#productGrid").innerHTML =
         '<div class="store-empty"><div><strong>لا توجد قطع في هذا القسم الآن</strong><span>شاهدي قسمًا آخر، أو عودي لاحقًا بعد إضافة منتجات جديدة.</span></div></div>';
@@ -358,59 +457,97 @@
     $("#productGrid").innerHTML = visible
       .map(
         (product) =>
-          `<article class="product-card" data-category="${esc(product.category)}" data-id="${esc(product.id)}" tabindex="0" role="button" aria-label="طلب ${esc(product.name)}"><div class="product-image" style="${productImageStyle(product)}">${product.badge ? `<span class="badge">${esc(product.badge)}</span>` : ""}<button class="heart" type="button" aria-label="إضافة للمفضلة">♡</button></div><div class="product-info"><div><small>${esc(categoryLabels[product.category] || product.category)}</small><h3>${esc(product.name)}</h3></div><div class="price"><strong>${format(product.price)} دج</strong>${Number(product.oldPrice) > 0 ? `<del>${format(product.oldPrice)} دج</del>` : ""}</div>${product.description ? `<p class="product-summary">${esc(product.description)}</p>` : ""}<button class="add" type="button"${Number(product.stock || 0) <= 0 ? " disabled" : ""}>${Number(product.stock || 0) > 0 ? "＋ أضف للسلة" : "غير متوفر حاليًا"}</button></div></article>`,
+          `<article class="product-card" data-category="${esc(product.category)}" data-id="${esc(product.id)}" tabindex="0" role="button" aria-label="طلب ${esc(product.name)}"><div class="product-image" style="${productImageStyle(product)}">${product.badge ? `<span class="badge">${esc(product.badge)}</span>` : ""}<button class="heart" type="button" aria-label="${favorites.has(String(product.id)) ? "إزالة من المفضلة" : "إضافة للمفضلة"}">${favorites.has(String(product.id)) ? "♥" : "♡"}</button></div><div class="product-info"><div><small>${esc(categoryLabels[product.category] || product.category)}</small><h3>${esc(product.name)}</h3></div><div class="price"><strong>${format(product.price)} دج</strong>${Number(product.oldPrice) > 0 ? `<del>${format(product.oldPrice)} دج</del>` : ""}</div>${product.description ? `<p class="product-summary">${esc(product.description)}</p>` : ""}<button class="add" type="button"${Number(product.stock || 0) <= 0 ? " disabled" : ""}>${Number(product.stock || 0) > 0 ? "＋ أضف للسلة" : "غير متوفر حاليًا"}</button></div></article>`,
       )
       .join("");
   }
 
   async function loadProducts(showError = true) {
-    const { data, error } = await client
-      .from("products")
-      .select("*")
-      .eq("visible", true)
-      .order("created_at", { ascending: false });
-    if (error) {
-      renderProducts(false);
-      if (showError) toast("تعذر تحميل المنتجات الآن. حاول تحديث الصفحة.");
+    if (!client) {
+      $("#productGrid").innerHTML =
+        '<div class="store-empty"><div><strong>تعذر الاتصال بالمتجر</strong><span>تأكد من تحميل مكتبة Supabase ومن اتصال الإنترنت، ثم حدّث الصفحة.</span></div></div>';
+      if (showError) toast("تعذر الاتصال بقاعدة بيانات المتجر.");
       return false;
     }
-    products = (data || []).map(productFromDb);
-    renderProducts();
-    updateCart();
-    if (activeProduct) {
-      const refreshed = products.find(
-        (product) => String(product.id) === String(activeProduct.id),
-      );
-      if (!refreshed || Number(refreshed.stock || 0) <= 0) closeOrder(false);
-      else activeProduct = refreshed;
+    try {
+      const { data, error } = await client
+        .from("products")
+        .select("*")
+        .eq("visible", true)
+        .order("created_at", { ascending: false });
+      if (error) throw error;
+      products = (data || []).map(productFromDb);
+      productsLoaded = true;
+      renderProducts();
+      updateCart();
+      if (activeProduct) {
+        const refreshed = products.find(
+          (product) => String(product.id) === String(activeProduct.id),
+        );
+        if (!refreshed || Number(refreshed.stock || 0) <= 0) {
+          closeOrder(false);
+          toast("هذا المنتج لم يعد متوفرًا حاليًا.");
+        } else {
+          activeProduct = refreshed;
+          $("#orderProductName").textContent = refreshed.name;
+          $("#orderProductPrice").textContent = `${formatOrderPrice(refreshed.price)} دج`;
+          $("#quantity").max = Math.max(1, refreshed.stock);
+          $("#quantity").value = Math.min(
+            Math.max(1, Number($("#quantity").value) || 1),
+            refreshed.stock,
+          );
+          updateOrderTotal();
+        }
+      }
+      return true;
+    } catch (error) {
+      console.error("تعذر تحميل المنتجات", error);
+      $("#productGrid").innerHTML =
+        '<div class="store-empty"><div><strong>تعذر تحميل المنتجات الآن</strong><span>لم نفقد محتويات سلّتك. حدّث الصفحة أو حاول مرة أخرى بعد قليل.</span></div></div>';
+      if (showError) toast("تعذر تحميل المنتجات الآن. حاول تحديث الصفحة.");
+      return false;
     }
-    return true;
   }
 
   async function loadShowcase(showError = true) {
-    const { data, error } = await client
-      .from("showcase_images")
-      .select("*")
-      .eq("visible", true)
-      .order("display_order", { ascending: true })
-      .limit(4);
-    if (error) {
+    if (!client) {
       showcaseImages = [];
       updateFeaturedProduct();
-      if (showError) toast("تعذر تحميل صور الدائرة. شغّل ملف إعداد Supabase المحدّث.");
       return false;
     }
-    showcaseImages = (data || []).map(showcaseFromDb).filter((item) => item.image);
-    updateFeaturedProduct();
-    return true;
+    try {
+      const { data, error } = await client
+        .from("showcase_images")
+        .select("*")
+        .eq("visible", true)
+        .order("display_order", { ascending: true })
+        .limit(4);
+      if (error) throw error;
+      showcaseImages = (data || [])
+        .map(showcaseFromDb)
+        .filter((item) => item.image);
+      updateFeaturedProduct();
+      return true;
+    } catch (error) {
+      console.error("تعذر تحميل صور الواجهة", error);
+      showcaseImages = [];
+      updateFeaturedProduct();
+      if (showError)
+        toast("تعذر تحميل صور الدائرة. تحقق من جدول showcase_images.");
+      return false;
+    }
   }
 
   function subscribeRealtime() {
+    if (!client || realtimeChannel) return;
     const queueReload = () => {
       clearTimeout(reloadTimer);
-      reloadTimer = setTimeout(() => Promise.all([loadProducts(false), loadShowcase(false)]), 350);
+      reloadTimer = setTimeout(
+        () => Promise.all([loadProducts(false), loadShowcase(false)]),
+        350,
+      );
     };
-    client
+    realtimeChannel = client
       .channel("webstore-products-live")
       .on(
         "postgres_changes",
@@ -434,10 +571,133 @@
   }
 
   function updateOrderTotal() {
-    const quantity = Math.max(1, Number($("#quantity").value) || 1);
-    $("#orderTotal").textContent = activeProduct
-      ? `${format(activeProduct.price * quantity)} دج`
-      : "٠ دج";
+    const quantityInput = $("#quantity");
+    const quantity = Math.max(1, Number(quantityInput?.value) || 1);
+    const unitPrice = activeProduct ? Number(activeProduct.price) || 0 : 0;
+
+    if (window.DarDelivery?.updateSummary) {
+      return window.DarDelivery.updateSummary(unitPrice, quantity);
+    }
+
+    const subtotal = unitPrice * quantity;
+    if ($("#productSubtotal"))
+      $("#productSubtotal").textContent = `${format(subtotal)} دج`;
+    if ($("#productSubtotalInput"))
+      $("#productSubtotalInput").value = String(subtotal);
+    if ($("#deliveryPrice")) $("#deliveryPrice").textContent = "يُحدّد لاحقًا";
+    if ($("#deliveryDuration"))
+      $("#deliveryDuration").textContent = "تواصل معنا لتأكيد التوصيل";
+    if ($("#orderTotal"))
+      $("#orderTotal").textContent = `${format(subtotal)} دج + التوصيل`;
+    if ($("#grandTotalInput")) $("#grandTotalInput").value = "";
+    return { qty: quantity, subtotal, delivery: null, grandTotal: null };
+  }
+
+  function getDeliveryDetails(quantity) {
+    const location = $("#location")?.value?.trim() || "";
+    const subtotal = (Number(activeProduct?.price) || 0) * quantity;
+    if (!window.DarDelivery?.calculate) {
+      return {
+        location,
+        subtotal,
+        delivery: null,
+        grandTotal: null,
+        deliveryAvailable: false,
+      };
+    }
+    const result = window.DarDelivery.calculate(
+      activeProduct?.price || 0,
+      quantity,
+      location,
+    );
+    return {
+      location,
+      subtotal: result.subtotal,
+      delivery: result.delivery,
+      grandTotal: result.grandTotal,
+      deliveryAvailable: true,
+    };
+  }
+
+  function deliveryNote(details) {
+    if (!details.delivery) return "";
+    const priceLabel = details.delivery.local
+      ? "حسب المكان"
+      : `${format(details.delivery.price)} دج`;
+    const totalLabel = Number.isFinite(details.grandTotal)
+      ? `${format(details.grandTotal)} دج`
+      : `${format(details.subtotal)} دج + التوصيل`;
+    return `[التوصيل] الولاية: ${details.location} | السعر: ${priceLabel} | المدة: ${details.delivery.duration} | الإجمالي: ${totalLabel}`;
+  }
+
+  function resolveOrderNumber(value) {
+    if (Array.isArray(value)) return resolveOrderNumber(value[0]);
+    if (value && typeof value === "object") {
+      const preferred =
+        value.order_number || value.id || value.number || value.create_order;
+      if (preferred != null) return preferred;
+      const primitive = Object.values(value).find(
+        (item) => ["string", "number"].includes(typeof item),
+      );
+      return primitive ?? null;
+    }
+    return value;
+  }
+
+  function saveOrderReceipt({
+    orderNumber,
+    product,
+    customer,
+    quantity,
+    details,
+  }) {
+    const orders = localJSON("dar-orders", []);
+    const resolvedOrderNumber = resolveOrderNumber(orderNumber);
+    const receipt = {
+      id: String(
+        resolvedOrderNumber || `DW-${Date.now().toString().slice(-8)}`,
+      ),
+      createdAt: new Intl.DateTimeFormat("ar-DZ", {
+        dateStyle: "medium",
+        timeStyle: "short",
+      }).format(new Date()),
+      firstName: customer.firstName,
+      lastName: customer.lastName,
+      phone: customer.phone,
+      location: customer.location,
+      productId: product.id,
+      product: product.name,
+      productImage: safeImages(product)[0] || "",
+      quantity,
+      size: customer.size,
+      color: customer.color,
+      notes: customer.notes,
+      productSubtotal: details.subtotal,
+      deliveryPrice:
+        details.delivery && Number.isFinite(details.delivery.price)
+          ? details.delivery.price
+          : null,
+      deliveryLabel: details.delivery?.local
+        ? "سعر التوصيل حسب المكان"
+        : "",
+      deliveryDuration: details.delivery?.duration || "",
+      grandTotal: Number.isFinite(details.grandTotal)
+        ? details.grandTotal
+        : null,
+      total: Number.isFinite(details.grandTotal)
+        ? details.grandTotal
+        : details.subtotal,
+      totalPendingDelivery: Boolean(details.delivery?.local),
+      status: "new",
+      inventoryAdjusted: true,
+      remote: true,
+    };
+    const nextOrders = Array.isArray(orders) ? [receipt, ...orders].slice(0, 50) : [receipt];
+    saveLocalJSON("dar-orders", nextOrders);
+    saveLocalJSON("dar-order-pulse", {
+      id: receipt.id,
+      createdAt: Date.now(),
+    });
   }
 
   function fillOptions(select, values, placeholder) {
@@ -531,7 +791,7 @@
     $("#orderThumbnails").innerHTML = galleryImages
       .map(
         (source, imageIndex) =>
-          `<button type="button" data-gallery="${imageIndex}" class="${imageIndex === galleryIndex ? "active" : ""}" aria-label="عرض الصورة ${imageIndex + 1}"><img src="${source}" alt=""></button>`,
+          `<button type="button" data-gallery="${imageIndex}" class="${imageIndex === galleryIndex ? "active" : ""}" aria-label="عرض الصورة ${imageIndex + 1}"><img src="${esc(source)}" alt="${esc(activeProduct?.name || "صورة المنتج")}"></button>`,
       )
       .join("");
     resetImageTransform();
@@ -539,7 +799,10 @@
 
   function prepareGallery(product) {
     galleryImages = safeImages(product);
-    $("#orderThumb").style.setProperty("--order-pos", product.pos || "center");
+    $("#orderThumb").style.setProperty(
+      "--order-pos",
+      safePosition(product.pos),
+    );
     const fallback =
       product.category === "table"
         ? "var(--category-table-img)"
@@ -559,11 +822,11 @@
       return toast("هذا المنتج غير متوفر حاليًا");
     closeCart();
     $("#orderProductName").textContent = activeProduct.name;
-    $("#orderProductPrice").textContent = `${format(activeProduct.price)} دج`;
+    $("#orderProductPrice").textContent = `${formatOrderPrice(activeProduct.price)} دج`;
     prepareGallery(activeProduct);
     restoreOrderDraft(activeProduct, quantity);
-    updateOrderTotal();
     $("#orderModal").hidden = false;
+    updateOrderTotal();
     setLocked(true);
     setTimeout(() => $("#firstName").focus(), 80);
   }
@@ -587,6 +850,8 @@
       return "اللون المحدد غير متوفر لهذا المنتج.";
     if (message.includes("INVALID_ORDER_DATA"))
       return "تحقق من بيانات الاسم والهاتف والعنوان.";
+    if (message.includes("PGRST202") || message.includes("create_order"))
+      return "دالة تسجيل الطلب غير متوافقة مع المتجر. حدّث إعداد Supabase.";
     return "تعذر إرسال الطلب الآن. حاول مرة أخرى.";
   }
 
@@ -647,11 +912,16 @@
       const heart = event.target.closest(".heart");
       if (heart) {
         event.stopPropagation();
-        heart.textContent = heart.textContent === "♥" ? "♡" : "♥";
+        const id = String(product.id);
+        if (favorites.has(id)) favorites.delete(id);
+        else favorites.add(id);
+        saveLocalJSON("dar-favorites", [...favorites]);
+        heart.textContent = favorites.has(id) ? "♥" : "♡";
         heart.setAttribute(
           "aria-label",
-          heart.textContent === "♥" ? "إزالة من المفضلة" : "إضافة للمفضلة",
+          favorites.has(id) ? "إزالة من المفضلة" : "إضافة للمفضلة",
         );
+        toast(favorites.has(id) ? "تمت الإضافة إلى المفضلة" : "تمت الإزالة من المفضلة");
         return;
       }
       if (event.target.closest(".add")) {
@@ -670,7 +940,11 @@
     };
     $("#productGrid").onkeydown = (event) => {
       const card = event.target.closest(".product-card");
-      if (card && (event.key === "Enter" || event.key === " ")) {
+      if (
+        card &&
+        event.target === card &&
+        (event.key === "Enter" || event.key === " ")
+      ) {
         event.preventDefault();
         openOrder(card.dataset.id);
       }
@@ -679,8 +953,11 @@
     $("#closeCart").onclick = closeCart;
     $("#overlay").onclick = closeCart;
     $("#checkout").onclick = () => {
+      if (!productsLoaded)
+        return toast("جاري تحميل تفاصيل السلّة. حاول بعد لحظة.");
       const first = products.find((product) => cart[product.id]);
       if (first) openOrder(first.id, cart[first.id]);
+      else toast("لا توجد منتجات متاحة في السلّة.");
     };
     $("#prevImage").onclick = () => showGalleryImage(galleryIndex - 1);
     $("#nextImage").onclick = () => showGalleryImage(galleryIndex + 1);
@@ -736,54 +1013,120 @@
       if (event.target === $("#orderModal")) closeOrder();
     };
     $("#quantity").oninput = updateOrderTotal;
+    $("#location").onchange = updateOrderTotal;
+    $("#orderImage").onerror = () => {
+      galleryImages = galleryImages.filter(
+        (source) => source !== $("#orderImage").src,
+      );
+      showGalleryImage(Math.min(galleryIndex, galleryImages.length - 1));
+    };
     $("#orderForm").onsubmit = async (event) => {
       event.preventDefault();
       if (!activeProduct) return;
-      const data = Object.fromEntries(new FormData(event.target).entries());
+      if (!client) return toast("تعذر الاتصال بقاعدة بيانات المتجر.");
+
+      const form = event.currentTarget;
+      const data = Object.fromEntries(new FormData(form).entries());
       const quantity = Math.max(1, Number(data.quantity) || 1);
       if (quantity > Number(activeProduct.stock || 0))
         return toast("الكمية المطلوبة أكبر من المتوفر حاليًا");
-      const button = event.submitter;
-      button.disabled = true;
-      button.textContent = "جاري تسجيل الطلب…";
-      const orderedProductId = activeProduct.id;
-      const { data: orderNumber, error } = await client.rpc("create_order", {
-        p_product_id: String(activeProduct.id),
-        p_first_name: data.firstName.trim(),
-        p_last_name: data.lastName.trim(),
-        p_phone: data.phone.trim(),
-        p_location: data.location.trim(),
-        p_quantity: quantity,
-        p_size: data.size,
-        p_color: data.color,
-        p_notes: data.notes.trim(),
-      });
-      button.disabled = false;
-      button.textContent = "تأكيد وإرسال الطلب ←";
-      if (error) {
+
+      const phoneDigits = String(data.phone || "")
+        .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
+        .replace(/[۰-۹]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹".indexOf(digit))
+        .replace(/\D/g, "");
+      if (phoneDigits.length < 9 || phoneDigits.length > 12)
+        return toast("تحقق من رقم الهاتف قبل إرسال الطلب.");
+
+      const details = getDeliveryDetails(quantity);
+      if (details.deliveryAvailable && !details.delivery)
+        return toast("اختر ولاية صحيحة لحساب التوصيل.");
+
+      const orderedProduct = { ...activeProduct };
+      const orderedProductId = orderedProduct.id;
+      const customer = {
+        firstName: String(data.firstName || "").trim(),
+        lastName: String(data.lastName || "").trim(),
+        phone: String(data.phone || "").trim(),
+        location: String(data.location || "").trim(),
+        size: String(data.size || ""),
+        color: String(data.color || ""),
+        notes: String(data.notes || "").trim(),
+      };
+      const systemDeliveryNote = deliveryNote(details);
+      const notesForServer = [customer.notes, systemDeliveryNote]
+        .filter(Boolean)
+        .join("\n");
+      const button =
+        event.submitter || form.querySelector('button[type="submit"]');
+      const originalButtonText = button?.textContent || "تأكيد وإرسال الطلب ←";
+      if (button) {
+        button.disabled = true;
+        button.textContent = "جاري تسجيل الطلب…";
+      }
+
+      try {
+        const { data: orderNumber, error } = await client.rpc("create_order", {
+          p_product_id: String(orderedProductId),
+          p_first_name: customer.firstName,
+          p_last_name: customer.lastName,
+          p_phone: customer.phone,
+          p_location: customer.location,
+          p_quantity: quantity,
+          p_size: customer.size,
+          p_color: customer.color,
+          p_notes: notesForServer,
+        });
+        if (error) throw error;
+
+        if (cart[orderedProductId]) {
+          cart[orderedProductId] = Math.max(
+            0,
+            Number(cart[orderedProductId]) - quantity,
+          );
+          if (!cart[orderedProductId]) delete cart[orderedProductId];
+        }
+        saveOrderReceipt({
+          orderNumber,
+          product: orderedProduct,
+          customer,
+          quantity,
+          details,
+        });
+        orderDrafts.delete(String(orderedProductId));
+        form.reset();
+        closeOrder(false);
+        updateCart();
+        const displayNumber = resolveOrderNumber(orderNumber) || "—";
+        toast(`تم تسجيل طلبك بنجاح — رقم ${displayNumber}`);
+        loadProducts(false);
+      } catch (error) {
+        console.error("تعذر إرسال الطلب", error);
         toast(orderError(error));
         await loadProducts(false);
-        return;
-      }
-      if (cart[orderedProductId]) {
-        cart[orderedProductId] = Math.max(0, cart[orderedProductId] - quantity);
-        if (!cart[orderedProductId]) delete cart[orderedProductId];
+      } finally {
+        if (button) {
+          button.disabled = false;
+          button.textContent = originalButtonText;
+        }
       }
-      orderDrafts.delete(String(orderedProductId));
-      event.target.reset();
-      closeOrder(false);
-      updateCart();
-      toast(`تم تسجيل طلبك بنجاح — رقم ${orderNumber}`);
     };
     $("#newsletter").onsubmit = (event) => {
       event.preventDefault();
       toast("تم تسجيل بريدك، وسنراسلك عند وصول جديد يستحق المشاهدة");
       event.target.reset();
     };
+    document.addEventListener("visibilitychange", () => {
+      if (document.hidden) stopFeaturedRotation();
+      else startFeaturedRotation();
+    });
     document.addEventListener("keydown", (event) => {
       if (event.key !== "Escape") return;
-      if (!$("#orderModal").hidden) closeOrder();
-      else closeCart();
+      if (!$("#orderModal").hidden) return closeOrder();
+      if ($("#drawer").classList.contains("open")) return closeCart();
+      if ($("#nav").classList.contains("open"))
+        return $("#nav").classList.remove("open");
+      if (!$("#searchBar").hidden) $("#searchBar").hidden = true;
     });
   }
 
