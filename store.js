(() => {
  "use strict";

  const SUPABASE_URL = "https://lscxhleqiflsrncqguqa.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_qFQklwHy5GULsEoudPrG4A_3OZQLqBy";
  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: true, autoRefreshToken: true },
    },
  );
  const storageImagePrefix = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
  const categoryLabels = {
    kitchen: "المطبخ",
    table: "المائدة",
    storage: "التنظيم",
  };

  // أسعار ومدة التوصيل حسب الولاية.
  // ولاية الشلف حالة خاصة: السعر يحدد حسب مكان التوصيل داخل الولاية.
  const deliveryGroups = [
    {
      price: 400,
      duration: "24 – 48 ساعة",
      wilayas: ["الجزائر العاصمة", "البليدة"],
    },
    {
      price: 600,
      duration: "1 – 3 أيام",
      wilayas: [
        "المدية",
        "تيبازة",
        "عين الدفلى",
        "بومرداس",
        "البويرة",
        "تيزي وزو",
      ],
    },
    {
      price: 700,
      duration: "2 – 4 أيام",
      wilayas: [
        "مستغانم",
        "برج بوعريريج",
        "تيارت",
        "تيسمسيلت",
        "غليزان",
        "الأغواط",
        "بجاية",
        "تلمسان",
        "جيجل",
        "الجلفة",
        "سطيف",
        "عنابة",
        "سيدي بلعباس",
        "قسنطينة",
        "ميلة",
        "عين تموشنت",
        "وهران",
      ],
    },
    {
      price: 800,
      duration: "3 – 5 أيام",
      wilayas: [
        "أم البواقي",
        "باتنة",
        "تبسة",
        "سكيكدة",
        "قالمة",
        "المسيلة",
        "معسكر",
        "خنشلة",
        "سوق أهراس",
        "الطارف",
        "بسكرة",
        "سعيدة",
        "أولاد جلال",
      ],
    },
    {
      price: 900,
      duration: "3 – 5 أيام",
      wilayas: ["ورقلة", "الوادي", "غرداية", "تقرت", "المنيعة", "المغير"],
    },
    {
      price: 1000,
      duration: "3 – 7 أيام",
      wilayas: ["بشار", "البيض", "النعامة", "بني عباس"],
    },
    {
      price: 1300,
      duration: "5 – 8 أيام",
      wilayas: [
        "أدرار",
        "تندوف",
        "إليزي",
        "تيميمون",
        "برج باجي مختار",
        "جانت",
      ],
    },
    {
      price: 1400,
      duration: "5 – 8 أيام",
      wilayas: ["تمنراست", "عين قزام", "عين صالح"],
    },
  ];

  const deliveryRates = new Map();
  deliveryGroups.forEach((group) => {
    group.wilayas.forEach((wilaya) => deliveryRates.set(wilaya, group));
  });
  deliveryRates.set("الشلف", {
    price: null,
    duration: "حسب مكان التوصيل داخل الولاية",
    local: true,
  });
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const localJSON = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  };
  const format = (number) =>
    new Intl.NumberFormat("ar-DZ").format(Number(number) || 0);
  const twoArabicDigits = (number) =>
    String(Math.max(0, Math.floor(Number(number) || 0)))
      .padStart(2, "0")
      .replace(/[0-9]/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[character],
    );
  const safeImage = (value) =>
    String(value || "").startsWith(storageImagePrefix) ? String(value) : "";
  const safeImages = (product) => {
    const values = Array.isArray(product?.images)
      ? product.images
      : [product?.image];
    return values
      .map(safeImage)
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .slice(0, 8);
  };

  let products = [];
  let cart = localJSON("dar-cart", {});
  let activeProduct = null;
  const orderDrafts = new Map();
  let galleryImages = [];
  let galleryIndex = 0;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let dragStart = null;
  let currentFilter = "all";
  let currentSearch = "";
  let pendingPurchase = null;
  let toastTimer;
  let reloadTimer;
  let showcaseImages = [];
  let featuredProducts = [];
  let featuredIndex = 0;
  let featuredTimer;
  let featuredUpdateTimer;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let theme =
    localStorage.getItem("dar-theme") ||
    (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");

  function productFromDb(row) {
    const images = Array.isArray(row.images)
      ? row.images.filter(safeImage).slice(0, 8)
      : [];
    return {
      id: row.id,
      name: row.name,
      price: Number(row.price),
      oldPrice: Number(row.old_price),
      category: row.category,
      description: row.description || "",
      badge: row.badge || "",
      stock: Number(row.stock),
      soldCount: Math.max(0, Number(row.sold_count) || 0),
      sizes: row.sizes || [],
      colors: row.colors || [],
      visible: row.visible !== false,
      featured: row.featured === true,
      featuredOrder: Number(row.featured_order) || 0,
      images,
      image: images[0] || "",
      pos: row.image_position || "center",
      code: row.code || "",
    };
  }

  function showcaseFromDb(row) {
    return {
      id: row.id,
      image: safeImage(row.image_url),
      title: row.title || "أفكار للمطبخ والمائدة",
      subtitle: row.subtitle || "صور نختارها لتساعدك على تنسيق بيتك بطريقة بسيطة",
      displayOrder: Number(row.display_order) || 1,
    };
  }

  function toast(message) {
    $("#toastText").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 3000);
  }

  function setTheme(nextTheme) {
    theme = nextTheme;
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem("dar-theme", nextTheme);
    $("#themeSymbol").textContent = nextTheme === "dark" ? "☀" : "☾";
    updateFeaturedProduct();
    document.querySelector('meta[name="theme-color"]').content =
      nextTheme === "dark" ? "#071e19" : "#f6efe6";
  }

  function featuredCandidates() {
    return showcaseImages
      .filter((item) => item.image)
      .sort((first, second) => first.displayOrder - second.displayOrder)
      .slice(0, 4);
  }

  function stopFeaturedRotation() {
    clearInterval(featuredTimer);
    featuredTimer = null;
  }

  function startFeaturedRotation() {
    stopFeaturedRotation();
    if (reducedMotion.matches || featuredProducts.length < 2) return;
    featuredTimer = setInterval(
      () => setFeaturedProduct(featuredIndex + 1, false),
      2000,
    );
  }

  function setFeaturedProduct(nextIndex, restart = true) {
    if (!featuredProducts.length) return;
    featuredIndex =
      (Number(nextIndex) + featuredProducts.length) % featuredProducts.length;
    const activeIndex = featuredIndex;
    const slide = featuredProducts[activeIndex];
    const angle = activeIndex * 90;
    const panel = $("#featuredPanel");
    const disc = $("#productWheelDisc");

    disc.style.setProperty("--wheel-angle", `${-angle}deg`);
    disc.style.setProperty("--counter-angle", `${angle}deg`);
    disc.querySelectorAll(".wheel-slice").forEach((slice, index) => {
      slice.classList.toggle("active", index === featuredIndex);
    });

    panel.classList.add("feature-changing");
    clearTimeout(featuredUpdateTimer);
    featuredUpdateTimer = window.setTimeout(() => {
      $("#featuredCounter").textContent =
        `${twoArabicDigits(activeIndex + 1)} / ${twoArabicDigits(featuredProducts.length)}`;
      $("#featuredBadge").textContent = "من بيتنا لبيتك";
      $("#featuredName").textContent = slide.title;
      $("#featuredDescription").textContent =
        slide.subtitle || "صور نختارها لتساعدك على تنسيق بيتك بطريقة بسيطة.";
      $("#featuredPrice").textContent = "صورة من اختيارنا";
      $("#featuredOldPrice").hidden = true;
      $("#featuredOpen").disabled = false;
      panel.classList.remove("feature-changing");
    }, reducedMotion.matches ? 0 : 120);

    $("#featureDots")
      .querySelectorAll(".wheel-dot")
      .forEach((dot, index) => {
        const active = index === featuredIndex;
        dot.classList.toggle("active", active);
        dot.setAttribute("aria-current", active ? "true" : "false");
      });

    if (restart) startFeaturedRotation();
  }

  function updateFeaturedProduct() {
    featuredProducts = featuredCandidates();
    featuredIndex = Math.min(
      featuredIndex,
      Math.max(0, featuredProducts.length - 1),
    );
    const stage = $("#productWheel");
    const disc = $("#productWheelDisc");
    const dots = $("#featureDots");
    stage.classList.toggle("wheel-ready", Boolean(featuredProducts.length));

    if (!featuredProducts.length) {
      stopFeaturedRotation();
      disc.innerHTML = "";
      dots.innerHTML = "";
      $("#featuredCounter").textContent = "٠٠ / ٠٠";
      $("#featuredBadge").textContent = "مساحة الصور";
      $("#featuredName").textContent = "ارفعي صور الأواني التي تحبينها";
      $("#featuredDescription").textContent =
        "ستظهر هنا بالترتيب الذي تختارينه من لوحة التحكم.";
      $("#featuredPrice").textContent = "—";
      $("#featuredOldPrice").hidden = true;
      $("#featuredOpen").disabled = true;
      $("#featurePrev").disabled = true;
      $("#featureNext").disabled = true;
      return;
    }

    disc.innerHTML = featuredProducts
      .map((slide, index) =>
        `<span class="wheel-slice${index === featuredIndex ? " active" : ""}" style="--slice-angle:${index * 90}deg;--slice-back-angle:${index * -90}deg;--wheel-image:url('${slide.image.replace(/'/g, "%27")}')"><span class="wheel-slice-art"></span></span>`,
      )
      .join("");
    dots.innerHTML = featuredProducts
      .map(
        (slide, index) =>
          `<button class="wheel-dot${index === featuredIndex ? " active" : ""}" type="button" data-feature-index="${index}" aria-label="عرض ${esc(slide.title)}" aria-current="${index === featuredIndex ? "true" : "false"}"></button>`,
      )
      .join("");
    $("#featurePrev").disabled = featuredProducts.length < 2;
    $("#featureNext").disabled = featuredProducts.length < 2;
    setFeaturedProduct(featuredIndex, false);
    startFeaturedRotation();
  }

  function setLocked(locked) {
    document.body.classList.toggle("lock", locked);
  }

  function openCart() {
    $("#drawer").classList.add("open");
    $("#overlay").hidden = false;
    setLocked(true);
  }

  function closeCart() {
    $("#drawer").classList.remove("open");
    $("#overlay").hidden = true;
    if ($("#orderModal").hidden) setLocked(false);
  }

  function cleanCart() {
    Object.keys(cart).forEach((id) => {
      const product = products.find((item) => String(item.id) === String(id));
      if (
        !product ||
        product.visible === false ||
        Number(product.stock || 0) <= 0
      )
        delete cart[id];
      else
        cart[id] = Math.min(
          Math.max(0, Number(cart[id]) || 0),
          Number(product.stock),
        );
      if (!cart[id]) delete cart[id];
    });
  }

  function updateCart() {
    cleanCart();
    localStorage.setItem("dar-cart", JSON.stringify(cart));
    const count = Object.values(cart).reduce(
      (sum, quantity) => sum + quantity,
      0,
    );
    const items = products.filter(
      (product) =>
        cart[product.id] &&
        product.visible !== false &&
        Number(product.stock || 0) > 0,
    );
    $("#cartCount").textContent = count;
    $("#cartCount").hidden = !count;
    $("#drawerTitle").textContent = count
      ? `${format(count)} قطع مختارة`
      : "السلة فارغة";
    if (!items.length) {
      $("#drawerItems").innerHTML =
        '<div class="empty"><span>♧</span><p>لم تضيفي أي قطعة بعد.</p><button id="start">ابدئي التسوق</button></div>';
      $("#drawerTotal").hidden = true;
      $("#start").onclick = closeCart;
      return;
    }
    $("#drawerItems").innerHTML = items
      .map((product) => {
        const image = safeImages(product)[0];
        const imageStyle = image
          ? `--product-image:url('${image.replace(/'/g, "%27")}')`
          : "";
        return `<div class="drawer-item"><div class="drawer-thumb" data-category="${esc(product.category)}" style="--pos:${esc(product.pos || "center")};${imageStyle}"></div><div><h3>${esc(product.name)}</h3><strong>${format(product.price)} دج</strong><div class="qty"><button data-id="${esc(product.id)}" data-step="-1">−</button><span>${format(cart[product.id])}</span><button data-id="${esc(product.id)}" data-step="1">+</button></div></div></div>`;
      })
      .join("");
    $$("[data-step]").forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.id;
        const product = products.find((item) => String(item.id) === String(id));
        if (!product) return;
        cart[id] = Math.min(
          (cart[id] || 0) + Number(button.dataset.step),
          Number(product.stock || 0),
        );
        if (cart[id] <= 0) delete cart[id];
        updateCart();
      };
    });
    $("#subtotal").textContent =
      format(
        items.reduce(
          (sum, product) => sum + product.price * cart[product.id],
          0,
        ),
      ) + " دج";
    $("#drawerTotal").hidden = false;
  }

  function productImageStyle(product) {
    const image = safeImages(product)[0];
    return `--pos:${esc(product.pos || "center")};${image ? `--product-image:url('${image.replace(/'/g, "%27")}')` : ""}`;
  }

  function renderProducts(loading = false) {
    if (loading) {
      $("#productGrid").innerHTML =
        '<div class="store-empty"><div><strong>جاري تحميل المنتجات…</strong><span>لحظات وتظهر أحدث المنتجات والمخزون.</span></div></div>';
      return;
    }
    const visible = products.filter(
      (product) =>
        product.visible !== false &&
        (currentFilter === "all" || product.category === currentFilter) &&
        (!currentSearch || String(product.name).includes(currentSearch)),
    );
    if (!visible.length) {
      $("#productGrid").innerHTML =
        '<div class="store-empty"><div><strong>لا توجد قطع في هذا القسم الآن</strong><span>شاهدي قسمًا آخر، أو عودي لاحقًا بعد إضافة منتجات جديدة.</span></div></div>';
      return;
    }
    const bestSold = Math.max(0, ...visible.map((product) => Number(product.soldCount || 0)));
    $("#productGrid").innerHTML = visible
      .map((product) => {
        const sold = Math.max(0, Number(product.soldCount || 0));
        const isBest = sold > 0 && sold === bestSold;
        const soldBadge = sold > 0
          ? `<span class="sold-badge${isBest ? " best" : ""}">${isBest ? "الأكثر مبيعًا · " : ""}تم بيع ${format(sold)}</span>`
          : "";
        return `<article class="product-card" data-category="${esc(product.category)}" data-id="${esc(product.id)}" tabindex="0" role="button" aria-label="طلب ${esc(product.name)}"><div class="product-image" style="${productImageStyle(product)}">${product.badge ? `<span class="badge">${esc(product.badge)}</span>` : ""}${soldBadge}<button class="heart" type="button" aria-label="إضافة للمفضلة">♡</button></div><div class="product-info"><div><small>${esc(categoryLabels[product.category] || product.category)}</small><h3>${esc(product.name)}</h3></div><div class="price"><strong>${format(product.price)} دج</strong>${Number(product.oldPrice) > 0 ? `<del>${format(product.oldPrice)} دج</del>` : ""}</div>${product.description ? `<p class="product-summary">${esc(product.description)}</p>` : ""}<button class="add" type="button"${Number(product.stock || 0) <= 0 ? " disabled" : ""}>${Number(product.stock || 0) > 0 ? "＋ أضف للسلة" : "غير متوفر حاليًا"}</button></div></article>`;
      })
      .join("");
  }

  async function loadProducts(showError = true) {
    const { data, error } = await client
      .from("products")
      .select("*")
      .eq("visible", true)
      .order("created_at", { ascending: false });
    if (error) {
      renderProducts(false);
      if (showError) toast("تعذر تحميل المنتجات الآن. حاول تحديث الصفحة.");
      return false;
    }
    products = (data || []).map(productFromDb);
    renderProducts();
    updateCart();
    if (activeProduct) {
      const refreshed = products.find(
        (product) => String(product.id) === String(activeProduct.id),
      );
      if (!refreshed || Number(refreshed.stock || 0) <= 0) closeOrder(false);
      else activeProduct = refreshed;
    }
    return true;
  }

  async function loadShowcase(showError = true) {
    const { data, error } = await client
      .from("showcase_images")
      .select("*")
      .eq("visible", true)
      .order("display_order", { ascending: true })
      .limit(4);
    if (error) {
      showcaseImages = [];
      updateFeaturedProduct();
      if (showError) toast("تعذر تحميل صور الدائرة. شغّل ملف إعداد Supabase المحدّث.");
      return false;
    }
    showcaseImages = (data || []).map(showcaseFromDb).filter((item) => item.image);
    updateFeaturedProduct();
    return true;
  }

  function subscribeRealtime() {
    const queueReload = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => Promise.all([loadProducts(false), loadShowcase(false)]), 350);
    };
    client
      .channel("webstore-products-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        queueReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "showcase_images" },
        queueReload,
      )
      .subscribe();
  }

  function filterProducts(key) {
    currentFilter = key;
    $$("[data-filter]").forEach((button) =>
      button.classList.toggle("active", button.dataset.filter === key),
    );
    renderProducts();
  }

  function updateOrderTotal() {
    const quantity = Math.max(1, Number($("#quantity")?.value) || 1);
    const productSubtotal = activeProduct
      ? Number(activeProduct.price || 0) * quantity
      : 0;
    const wilaya = $("#location")?.value?.trim() || "";
    const delivery = deliveryRates.get(wilaya) || null;

    const setText = (selector, value) => {
      const element = $(selector);
      if (element) element.textContent = value;
    };
    const setValue = (selector, value) => {
      const element = $(selector);
      if (element) element.value = value;
    };

    setText("#productSubtotal", `${format(productSubtotal)} دج`);
    setValue("#productSubtotalInput", String(productSubtotal));

    if (!delivery) {
      setText("#deliveryPrice", "اختر الولاية");
      setText("#deliveryDuration", "اختر الولاية لمعرفة المدة");
      setText("#orderTotal", "اختر الولاية");
      setValue("#deliveryPriceInput", "");
      setValue("#deliveryDurationInput", "");
      setValue("#grandTotalInput", "");
      return;
    }

    if (delivery.local) {
      setText("#deliveryPrice", "سعر التوصيل حسب المكان");
      setText("#deliveryDuration", delivery.duration);
      setText("#orderTotal", `${format(productSubtotal)} دج + التوصيل`);
      setValue("#deliveryPriceInput", "حسب المكان");
      setValue("#deliveryDurationInput", delivery.duration);
      setValue("#grandTotalInput", "");
      return;
    }

    const grandTotal = productSubtotal + Number(delivery.price || 0);
    setText("#deliveryPrice", `${format(delivery.price)} دج`);
    setText("#deliveryDuration", `مدة التوصيل: ${delivery.duration}`);
    setText("#orderTotal", `${format(grandTotal)} دج`);
    setValue("#deliveryPriceInput", String(delivery.price));
    setValue("#deliveryDurationInput", delivery.duration);
    setValue("#grandTotalInput", String(grandTotal));
  }

  function fillOptions(select, values, placeholder) {
    const options =
      Array.isArray(values) && values.length ? values : ["حسب المتوفر"];
    select.innerHTML =
      `<option value="">${placeholder}</option>` +
      options
        .map((value) => `<option value="${esc(value)}">${esc(value)}</option>`)
        .join("");
  }

  function captureOrderDraft() {
    if (!activeProduct || $("#orderModal").hidden) return;
    orderDrafts.set(
      String(activeProduct.id),
      Object.fromEntries(new FormData($("#orderForm")).entries()),
    );
  }

  function restoreOrderDraft(product, requestedQuantity) {
    const form = $("#orderForm");
    const draft = orderDrafts.get(String(product.id)) || {};
    form.reset();
    fillOptions($("#size"), product.sizes, "اختر المقاس");
    fillOptions($("#color"), product.colors, "اختر اللون");
    ["firstName", "lastName", "phone", "location", "notes"].forEach((name) => {
      if (typeof draft[name] === "string")
        form.elements[name].value = draft[name];
    });
    if (
      draft.size &&
      [...$("#size").options].some((option) => option.value === draft.size)
    )
      $("#size").value = draft.size;
    if (
      draft.color &&
      [...$("#color").options].some((option) => option.value === draft.color)
    )
      $("#color").value = draft.color;
    const preferredQuantity = requestedQuantity ?? draft.quantity ?? 1;
    $("#quantity").max = Math.max(1, Number(product.stock || 1));
    $("#quantity").value = Math.min(
      Math.max(1, Number(preferredQuantity) || 1),
      Number(product.stock || 1),
    );
  }

  function applyImageTransform() {
    $("#orderImage").style.transform =
      `translate3d(${panX}px,${panY}px,0) scale(${zoom})`;
    $("#zoomOut").disabled = zoom <= 1;
    $("#zoomIn").disabled = zoom >= 4;
  }

  function resetImageTransform() {
    zoom = 1;
    panX = 0;
    panY = 0;
    dragStart = null;
    $("#orderImage").classList.remove("dragging");
    applyImageTransform();
  }

  function changeZoom(nextZoom) {
    zoom = Math.min(4, Math.max(1, Number(nextZoom.toFixed(2))));
    if (zoom === 1) {
      panX = 0;
      panY = 0;
    }
    applyImageTransform();
  }

  function showGalleryImage(index) {
    if (!galleryImages.length) {
      galleryIndex = 0;
      $("#orderImage").hidden = true;
      $("#orderFallback").hidden = false;
      $("#orderThumbnails").innerHTML = "";
      $("#prevImage").hidden = $("#nextImage").hidden = true;
      $("#zoomTools").hidden = true;
      resetImageTransform();
      return;
    }
    galleryIndex = (index + galleryImages.length) % galleryImages.length;
    $("#orderImage").src = galleryImages[galleryIndex];
    $("#orderImage").hidden = false;
    $("#orderFallback").hidden = true;
    $("#zoomTools").hidden = false;
    $("#prevImage").hidden = $("#nextImage").hidden = galleryImages.length < 2;
    $("#orderThumbnails").innerHTML = galleryImages
      .map(
        (source, imageIndex) =>
          `<button type="button" data-gallery="${imageIndex}" class="${imageIndex === galleryIndex ? "active" : ""}" aria-label="عرض الصورة ${imageIndex + 1}"><img src="${source}" alt=""></button>`,
      )
      .join("");
    resetImageTransform();
  }

  function prepareGallery(product) {
    galleryImages = safeImages(product);
    $("#orderThumb").style.setProperty("--order-pos", product.pos || "center");
    const fallback =
      product.category === "table"
        ? "var(--category-table-img)"
        : product.category === "storage"
          ? "var(--category-storage-img)"
          : "var(--category-kitchen-img)";
    $("#orderFallback").style.setProperty("--order-fallback", fallback);
    showGalleryImage(0);
  }

  function openOrder(productId, quantity) {
    activeProduct = products.find(
      (product) => String(product.id) === String(productId),
    );
    if (!activeProduct) return;
    if (Number(activeProduct.stock || 0) <= 0)
      return toast("هذا المنتج غير متوفر حاليًا");
    closeCart();
    $("#orderProductName").textContent = activeProduct.name;
    $("#orderProductPrice").textContent = `${format(activeProduct.price)} دج`;
    prepareGallery(activeProduct);
    restoreOrderDraft(activeProduct, quantity);
    updateOrderTotal();
    hidePurchaseConfirmation();
    $("#orderModal").hidden = false;
    setLocked(true);
    setTimeout(() => $("#firstName").focus(), 80);
  }

  function closeOrder(saveDraft = true) {
    if (saveDraft) captureOrderDraft();
    hidePurchaseConfirmation();
    $("#orderModal").hidden = true;
    activeProduct = null;
    if (!$("#drawer").classList.contains("open")) setLocked(false);
  }

  function orderError(error) {
    const message = String(error?.message || "");
    if (message.includes("OUT_OF_STOCK"))
      return "الكمية المطلوبة لم تعد متوفرة. تم تحديث المخزون.";
    if (message.includes("PRODUCT_NOT_FOUND"))
      return "هذا المنتج لم يعد متوفرًا في المتجر.";
    if (message.includes("INVALID_SIZE"))
      return "المقاس المحدد غير متوفر لهذا المنتج.";
    if (message.includes("INVALID_COLOR"))
      return "اللون المحدد غير متوفر لهذا المنتج.";
    if (message.includes("INVALID_ORDER_DATA"))
      return "تحقق من بيانات الاسم والهاتف والعنوان.";
    return "تعذر إرسال الطلب الآن. حاول مرة أخرى.";
  }

  function hidePurchaseConfirmation() {
    const box = $("#purchaseConfirmation");
    if (!box) return;
    box.hidden = true;
    box.classList.remove("result");
    $("#purchaseConfirmMark").textContent = "؟";
    $("#purchaseConfirmTitle").textContent = "هل تريد تأكيد الشراء؟";
    $("#purchaseConfirmText").textContent =
      "راجع بياناتك ثم اختر نعم لإرسال الطلب أو رفض للعودة دون تسجيله.";
    pendingPurchase = null;
  }

  function showPurchaseQuestion(payload) {
    pendingPurchase = payload;
    const box = $("#purchaseConfirmation");
    box.classList.remove("result");
    $("#purchaseConfirmMark").textContent = "؟";
    $("#purchaseConfirmTitle").textContent = "هل تريد تأكيد الشراء؟";
    $("#purchaseConfirmText").textContent =
      `سيتم تسجيل ${format(payload.quantity)} قطعة من ${activeProduct?.name || "المنتج"}.`;
    box.hidden = false;
    box.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "nearest" });
  }

  function showPurchaseResult(approved, orderNumber = "") {
    const box = $("#purchaseConfirmation");
    box.hidden = false;
    box.classList.add("result");
    $("#purchaseConfirmMark").textContent = approved ? "✓" : "♡";
    $("#purchaseConfirmTitle").textContent = approved
      ? "شكراً، سيتم الاتصال بك لاحقاً"
      : "رضاؤكم يهمنا";
    $("#purchaseConfirmText").textContent = approved
      ? `تم تسجيل طلبك بنجاح${orderNumber ? ` — رقم ${orderNumber}` : ""}.`
      : "لم يتم تسجيل أي طلب. يمكنك تعديل البيانات أو اختيار منتج آخر.";
  }

  async function submitConfirmedPurchase() {
    if (!pendingPurchase || !activeProduct) return;
    const payload = pendingPurchase;
    const button = $("#purchaseApprove");
    button.disabled = true;
    button.textContent = "جاري الإرسال…";
    const orderedProductId = activeProduct.id;
    const { data: orderNumber, error } = await client.rpc("create_order", {
      p_product_id: String(activeProduct.id),
      p_first_name: payload.firstName.trim(),
      p_last_name: payload.lastName.trim(),
      p_phone: payload.phone.trim(),
      p_location: payload.location.trim(),
      p_quantity: payload.quantity,
      p_size: payload.size,
      p_color: payload.color,
      p_notes: payload.notes.trim(),
    });
    button.disabled = false;
    button.textContent = "نعم";
    if (error) {
      toast(orderError(error));
      await loadProducts(false);
      return;
    }
    if (cart[orderedProductId]) {
      cart[orderedProductId] = Math.max(0, cart[orderedProductId] - payload.quantity);
      if (!cart[orderedProductId]) delete cart[orderedProductId];
    }
    orderDrafts.delete(String(orderedProductId));
    $("#orderForm").reset();
    updateCart();
    pendingPurchase = null;
    showPurchaseResult(true, orderNumber);
    await loadProducts(false);
    setTimeout(() => closeOrder(false), 2600);
  }

  function bindEvents() {
    $("#themeBtn").onclick = () =>
      setTheme(theme === "light" ? "dark" : "light");
    $("#menuBtn").onclick = () => $("#nav").classList.add("open");
    $("#closeMenu").onclick = () => $("#nav").classList.remove("open");
    $$("#nav a").forEach(
      (anchor) => (anchor.onclick = () => $("#nav").classList.remove("open")),
    );
    $$("[data-nav-filter]").forEach((anchor) =>
      anchor.addEventListener("click", () =>
        filterProducts(anchor.dataset.navFilter),
      ),
    );
    $("#searchBtn").onclick = () => {
      $("#searchBar").hidden = !$("#searchBar").hidden;
      if (!$("#searchBar").hidden) $("#searchBar input").focus();
    };
    $("#closeSearch").onclick = () => ($("#searchBar").hidden = true);
    $("#searchBar input").oninput = (event) => {
      currentSearch = event.target.value.trim();
      renderProducts();
    };
    $$("[data-filter]").forEach(
      (button) =>
        (button.onclick = () => filterProducts(button.dataset.filter)),
    );
    $$("[data-jump]").forEach((button) => {
      button.onclick = () => {
        filterProducts(button.dataset.jump);
        $("#products").scrollIntoView({ behavior: "smooth" });
      };
    });
    $("#featurePrev").onclick = () => setFeaturedProduct(featuredIndex - 1);
    $("#featureNext").onclick = () => setFeaturedProduct(featuredIndex + 1);
    $("#featureDots").onclick = (event) => {
      const dot = event.target.closest("[data-feature-index]");
      if (dot) setFeaturedProduct(Number(dot.dataset.featureIndex));
    };
    $("#featuredOpen").onclick = () =>
      $("#products").scrollIntoView({ behavior: "smooth" });
    $("#productWheel").addEventListener("mouseenter", stopFeaturedRotation);
    $("#productWheel").addEventListener("mouseleave", startFeaturedRotation);
    $("#productWheel").addEventListener("focusin", stopFeaturedRotation);
    $("#productWheel").addEventListener("focusout", (event) => {
      if (!$("#productWheel").contains(event.relatedTarget)) startFeaturedRotation();
    });
    reducedMotion.addEventListener?.("change", startFeaturedRotation);
    $("#productGrid").onclick = (event) => {
      const card = event.target.closest(".product-card");
      if (!card) return;
      const product = products.find(
        (item) => String(item.id) === String(card.dataset.id),
      );
      if (!product) return;
      const heart = event.target.closest(".heart");
      if (heart) {
        event.stopPropagation();
        heart.textContent = heart.textContent === "♥" ? "♡" : "♥";
        heart.setAttribute(
          "aria-label",
          heart.textContent === "♥" ? "إزالة من المفضلة" : "إضافة للمفضلة",
        );
        return;
      }
      if (event.target.closest(".add")) {
        event.stopPropagation();
        if (Number(product.stock || 0) <= 0)
          return toast("هذا المنتج غير متوفر حاليًا");
        cart[product.id] = Math.min(
          (cart[product.id] || 0) + 1,
          Number(product.stock),
        );
        updateCart();
        toast("تمت إضافة القطعة إلى سلّتك");
        return;
      }
      openOrder(product.id);
    };
    $("#productGrid").onkeydown = (event) => {
      const card = event.target.closest(".product-card");
      if (card && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        openOrder(card.dataset.id);
      }
    };
    $("#cartBtn").onclick = openCart;
    $("#closeCart").onclick = closeCart;
    $("#overlay").onclick = closeCart;
    $("#checkout").onclick = () => {
      const first = products.find((product) => cart[product.id]);
      if (first) openOrder(first.id, cart[first.id]);
    };
    $("#prevImage").onclick = () => showGalleryImage(galleryIndex - 1);
    $("#nextImage").onclick = () => showGalleryImage(galleryIndex + 1);
    $("#orderThumbnails").onclick = (event) => {
      const button = event.target.closest("[data-gallery]");
      if (button) showGalleryImage(Number(button.dataset.gallery));
    };
    $("#zoomIn").onclick = () => changeZoom(zoom + 0.35);
    $("#zoomOut").onclick = () => changeZoom(zoom - 0.35);
    $("#zoomReset").onclick = resetImageTransform;
    $("#orderThumb").onwheel = (event) => {
      if ($("#orderImage").hidden) return;
      event.preventDefault();
      changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
    };
    $("#orderThumb").onpointerdown = (event) => {
      if (
        $("#orderImage").hidden ||
        zoom <= 1 ||
        event.target.closest("button")
      )
        return;
      event.preventDefault();
      dragStart = {
        x: event.clientX - panX,
        y: event.clientY - panY,
        id: event.pointerId,
      };
      $("#orderThumb").setPointerCapture(event.pointerId);
      $("#orderImage").classList.add("dragging");
    };
    $("#orderThumb").onpointermove = (event) => {
      if (!dragStart || dragStart.id !== event.pointerId) return;
      const limitX = ($("#orderThumb").clientWidth * (zoom - 1)) / 2;
      const limitY = ($("#orderThumb").clientHeight * (zoom - 1)) / 2;
      panX = Math.max(-limitX, Math.min(limitX, event.clientX - dragStart.x));
      panY = Math.max(-limitY, Math.min(limitY, event.clientY - dragStart.y));
      applyImageTransform();
    };
    const stopImageDrag = (event) => {
      if (!dragStart || dragStart.id !== event.pointerId) return;
      dragStart = null;
      $("#orderImage").classList.remove("dragging");
      try {
        $("#orderThumb").releasePointerCapture(event.pointerId);
      } catch (_) {}
    };
    $("#orderThumb").onpointerup = stopImageDrag;
    $("#orderThumb").onpointercancel = stopImageDrag;
    $("#orderThumb").ondblclick = () => changeZoom(zoom > 1 ? 1 : 2);
    $("#closeOrder").onclick = () => closeOrder();
    $("#orderModal").onclick = (event) => {
      if (event.target === $("#orderModal")) closeOrder();
    };
    $("#quantity").oninput = updateOrderTotal;
    $("#location").onchange = updateOrderTotal;
    $("#orderForm").onsubmit = (event) => {
      event.preventDefault();
      if (!activeProduct) return;
      const data = Object.fromEntries(new FormData(event.target).entries());
      const quantity = Math.max(1, Number(data.quantity) || 1);
      if (quantity > Number(activeProduct.stock || 0))
        return toast("الكمية المطلوبة أكبر من المتوفر حاليًا");
      showPurchaseQuestion({
        ...data,
        quantity,
        firstName: String(data.firstName || ""),
        lastName: String(data.lastName || ""),
        phone: String(data.phone || ""),
        location: String(data.location || ""),
        size: String(data.size || ""),
        color: String(data.color || ""),
        notes: String(data.notes || ""),
      });
    };
    $("#purchaseApprove").onclick = submitConfirmedPurchase;
    $("#purchaseReject").onclick = () => {
      pendingPurchase = null;
      showPurchaseResult(false);
      setTimeout(() => hidePurchaseConfirmation(), 2600);
    };
    $("#newsletter").onsubmit = (event) => {
      event.preventDefault();
      toast("تم تسجيل بريدك، وسنراسلك عند وصول جديد يستحق المشاهدة");
      event.target.reset();
    };
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("#orderModal").hidden) closeOrder();
      else closeCart();
    });
  }

  function setupMotion() {
    const targets = $$(".section,.offer,.story,.newsletter,footer");
    targets.forEach((element) => element.classList.add("reveal"));
    document.body.classList.add("motion-ready");
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              observer.unobserve(entry.target);
            }
          }),
        { threshold: 0.08 },
      );
      targets.forEach((element) => observer.observe(element));
    } else targets.forEach((element) => element.classList.add("visible"));
  }

  async function init() {
    setTheme(theme);
    bindEvents();
    setupMotion();
    renderProducts(true);
    updateCart();
    await Promise.all([loadProducts(true), loadShowcase(true)]);
    subscribeRealtime();
  }

  init();
})();
