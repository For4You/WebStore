(() => {
  "use strict";

  const SUPABASE_URL = "https://lscxhleqiflsrncqguqa.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_qFQklwHy5GULsEoudPrG4A_3OZQLqBy";
  const client = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const categories = {
    kitchen: "المطبخ",
    table: "المائدة",
    storage: "التنظيم",
  };
  const statusLabels = {
    new: "جديد",
    confirmed: "مؤكد",
    processing: "قيد التجهيز",
    completed: "مكتمل",
    rejected: "مرفوض",
  };
  const stockStatuses = new Set(["confirmed", "processing", "completed"]);
  const storageImagePrefix = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;

  const localJSON = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  };
  const legacyProducts = localJSON("dar-products", []);
  let products = [];
  let orders = [];
  let seenOrders = localJSON("dar-seen-orders", []);
  let images = [];
  let pending = null;
  let toastTimer;
  let realtimeChannel;
  let reloadTimer;

  if (!Array.isArray(seenOrders)) seenOrders = [];

  const fmt = (number) =>
    new Intl.NumberFormat("ar-DZ", { maximumFractionDigits: 2 }).format(
      Number(number) || 0,
    );
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
  const splitList = (value) =>
    String(value || "")
      .split(/[،,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  const isDataImage = (value) =>
    /^data:image\/(?:jpeg|png|webp);base64,/i.test(String(value || ""));
  const isStoredImage = (value) =>
    String(value || "").startsWith(storageImagePrefix);
  const safeImage = (value) =>
    isDataImage(value) || isStoredImage(value) ? String(value) : "";
  const safeImages = (product) => {
    const values = Array.isArray(product?.images)
      ? product.images
      : [product?.image];
    return values
      .map(safeImage)
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .slice(0, 8);
  };

  function productFromDb(row) {
    const productImages = Array.isArray(row.images)
      ? row.images.filter(isStoredImage).slice(0, 8)
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
      sizes: row.sizes || [],
      colors: row.colors || [],
      visible: row.visible !== false,
      featured: row.featured === true,
      featuredOrder: Number(row.featured_order) || 0,
      images: productImages,
      image: productImages[0] || "",
      pos: row.image_position || "center",
      code: row.code || "",
      createdAt: row.created_at,
    };
  }

  function productToDb(product) {
    const productImages = safeImages(product).filter(isStoredImage);
    return {
      id: String(product.id),
      name: String(product.name || "").trim(),
      price: Number(product.price) || 0,
      old_price: Number(product.oldPrice) || 0,
      category: product.category,
      description: String(product.description || "").trim(),
      badge: String(product.badge || "").trim(),
      stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
      sizes: Array.isArray(product.sizes) ? product.sizes : [],
      colors: Array.isArray(product.colors) ? product.colors : [],
      visible: product.visible !== false,
      featured: product.featured === true,
      featured_order: product.featured === true
        ? Math.max(1, Math.floor(Number(product.featuredOrder) || 1))
        : 0,
      images: productImages,
      image_position: product.pos || "center",
      code: String(product.code || "").trim(),
    };
  }

  function orderFromDb(row) {
    return {
      dbId: row.id,
      id: row.order_number,
      createdAt: new Intl.DateTimeFormat("ar-DZ", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(row.created_at)),
      firstName: row.first_name,
      lastName: row.last_name,
      phone: row.phone,
      location: row.location,
      productId: row.product_id,
      product: row.product_name,
      productImage: safeImage(row.product_image),
      quantity: Number(row.quantity),
      size: row.size || "",
      color: row.color || "",
      notes: row.notes || "",
      total: Number(row.total),
      status: row.status,
      inventoryAdjusted: row.inventory_adjusted,
    };
  }

  function toast(message) {
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 2800);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dar-theme", theme);
    $("#theme").textContent = theme === "dark" ? "☀" : "☾";
    document.querySelector('meta[name="theme-color"]').content =
      theme === "dark" ? "#071e19" : "#f8f1e7";
  }

  function friendlyError(error, fallback = "تعذر إكمال العملية") {
    const message = String(error?.message || error || "");
    if (message.includes("INSUFFICIENT_STOCK"))
      return "المخزون غير كافٍ لتأكيد هذا الطلب";
    if (message.includes("Invalid login credentials"))
      return "البريد أو كلمة السر غير صحيحة";
    if (message.includes("JWT") || message.includes("session"))
      return "انتهت جلسة الدخول، سجّل الدخول مجددًا";
    if (
      message.includes("row-level security") ||
      message.includes("permission")
    )
      return "هذا الحساب غير مخوّل لإدارة المتجر";
    return fallback;
  }

  function showAuth(message = "") {
    $("#authModal").hidden = false;
    $("#logout").hidden = true;
    $("#authError").hidden = !message;
    $("#authError").textContent = message;
    document.body.classList.add("lock");
  }

  function hideAuth() {
    $("#authModal").hidden = true;
    $("#logout").hidden = false;
    $("#authError").hidden = true;
    document.body.classList.remove("lock");
  }

  function setSyncState(message) {
    $("#syncState").textContent = message;
  }

  async function requireAdmin(session) {
    if (!session) {
      showAuth();
      return false;
    }
    const { data, error } = await client.rpc("is_admin");
    if (error || data !== true) {
      await client.auth.signOut();
      showAuth("هذا الحساب غير مضاف إلى قائمة مديري المتجر.");
      return false;
    }
    hideAuth();
    await refreshAll();
    subscribeRealtime();
    return true;
  }

  async function loadProducts() {
    const { data, error } = await client
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    products = (data || []).map(productFromDb);
    renderProducts();
    return products;
  }

  async function loadOrders() {
    const { data, error } = await client
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    orders = (data || []).map(orderFromDb);
    renderNewOrders();
    if (!$("#ordersView").hidden) renderOrders();
    stats();
    return orders;
  }

  async function refreshAll(showMessage = false) {
    try {
      setSyncState("جاري مزامنة البيانات…");
      await Promise.all([loadProducts(), loadOrders()]);
      setSyncState(
        `متصل — ${fmt(products.length)} منتج و${fmt(orders.length)} طلب مشترك`,
      );
      if (showMessage) toast("تم تحديث البيانات من Supabase");
    } catch (error) {
      setSyncState("تعذر الاتصال. تأكد من تشغيل ملف إعداد Supabase.");
      toast(friendlyError(error, "تعذر تحميل بيانات المتجر"));
    }
  }

  function subscribeRealtime() {
    if (realtimeChannel) client.removeChannel(realtimeChannel);
    const queueReload = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => refreshAll(false), 350);
    };
    realtimeChannel = client
      .channel("webstore-admin-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products" },
        queueReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        queueReload,
      )
      .subscribe();
  }

  function stats() {
    $("#sProducts").textContent = fmt(products.length);
    $("#sVisible").textContent = fmt(
      products.filter((product) => product.visible !== false).length,
    );
    $("#sStock").textContent = fmt(
      products.reduce((sum, product) => sum + Number(product.stock || 0), 0),
    );
    $("#sOrders").textContent = fmt(orders.length);
    $("#sRevenue").textContent =
      fmt(
        orders
          .filter((order) => stockStatuses.has(order.status))
          .reduce((sum, order) => sum + Number(order.total || 0), 0),
      ) + " دج";
  }

  function saveSeen() {
    localStorage.setItem(
      "dar-seen-orders",
      JSON.stringify(seenOrders.slice(-300)),
    );
  }

  function markSeen(orderNumber) {
    if (!seenOrders.includes(orderNumber)) {
      seenOrders.push(orderNumber);
      saveSeen();
    }
    renderNewOrders();
  }

  function renderNewOrders() {
    const unseen = orders.filter(
      (order) => order.status === "new" && !seenOrders.includes(order.id),
    );
    const notice = $("#newOrdersNotice");
    const badge = $("#orderTabBadge");
    badge.textContent = fmt(unseen.length);
    badge.hidden = !unseen.length;
    document.title = unseen.length
      ? `(${fmt(unseen.length)}) طلب جديد — دار وأناقة`
      : "لوحة إدارة دار وأناقة";
    if (!unseen.length) {
      notice.hidden = true;
      $("#newOrdersList").innerHTML = "";
      return;
    }
    notice.hidden = false;
    $("#newOrdersTitle").textContent =
      unseen.length === 1
        ? "لديك طلب جديد"
        : `لديك ${fmt(unseen.length)} طلبات جديدة`;
    $("#newOrdersList").innerHTML = unseen
      .slice(0, 6)
      .map(
        (order) =>
          `<button class="notice-card" type="button" data-notice-id="${esc(order.dbId)}"><span class="notice-icon">↗</span><span><strong>${esc(order.firstName)} ${esc(order.lastName)}</strong><small>${esc(order.product)} · ${esc(order.createdAt)}</small></span><span class="notice-price">${fmt(order.total)} دج</span></button>`,
      )
      .join("");
  }

  function imageStyle(product) {
    const source = safeImages(product)[0];
    return source ? `--image:url('${source.replace(/'/g, "%27")}')` : "";
  }

  function renderProducts() {
    stats();
    const query = $("#productSearch").value.trim().toLowerCase();
    const filter = $("#productFilter").value;
    const shown = products.filter(
      (product) =>
        (filter === "all" || product.category === filter) &&
        (!query ||
          String(product.name).toLowerCase().includes(query) ||
          String(product.code || "")
            .toLowerCase()
            .includes(query)),
    );
    if (!shown.length) {
      $("#productList").innerHTML =
        '<div class="empty"><div><b>لا توجد منتجات مطابقة</b><span>أضف منتجًا أو غيّر البحث.</span></div></div>';
      return;
    }
    $("#productList").innerHTML = shown
      .map(
        (product) =>
          `<article class="product-row" data-id="${esc(product.id)}"><div class="thumb" style="${imageStyle(product)}"></div><div class="main-data"><strong>${esc(product.name)}</strong><small>${esc(product.code || "دون رمز")} · ${fmt(safeImages(product).length)} صور · ${esc(product.badge || "دون شارة")}</small></div><div class="meta category-cell"><strong>${esc(categories[product.category] || product.category)}</strong><small>القسم</small></div><div class="meta price-cell"><strong>${fmt(product.price)} دج</strong>${Number(product.oldPrice) > 0 ? `<small><s>${fmt(product.oldPrice)} دج</s></small>` : "<small>السعر</small>"}</div><div class="stock-cell"><span class="chip ${Number(product.stock || 0) <= 5 ? "low" : ""}">${fmt(product.stock)} قطعة</span><span class="chip ${product.visible === false ? "off" : ""}">${product.visible === false ? "مخفي" : "ظاهر"}</span><span class="chip ${product.featured ? "" : "off"}">${product.featured ? `إعلان ${fmt(product.featuredOrder || 1)}` : "عادي"}</span></div><div class="row-actions"><button class="btn small edit">تعديل</button><button class="btn small copy">نسخ</button><button class="btn small danger delete">حذف</button></div></article>`,
      )
      .join("");
  }

  function openProduct(product) {
    const editing = Boolean(product);
    $("#modalKicker").textContent = editing
      ? "تعديل بيانات المنتج"
      : "منتج جديد";
    $("#modalTitle").textContent = editing
      ? `تعديل ${product.name}`
      : "إضافة منتج";
    $("#pId").value = editing ? product.id : "";
    $("#pName").value = editing ? product.name : "";
    $("#pPrice").value = editing ? product.price : "";
    $("#pOldPrice").value =
      editing && Number(product.oldPrice) ? product.oldPrice : "";
    $("#pCategory").value = editing ? product.category : "kitchen";
    $("#pStock").value = editing ? Number(product.stock || 0) : 1;
    $("#pDescription").value = editing ? product.description || "" : "";
    $("#pSizes").value = editing ? (product.sizes || []).join("، ") : "";
    $("#pColors").value = editing ? (product.colors || []).join("، ") : "";
    $("#pBadge").value = editing ? product.badge || "" : "";
    $("#pCode").value = editing ? product.code || "" : "";
    $("#pVisible").checked = editing ? product.visible !== false : true;
    $("#pFeatured").checked = editing ? product.featured === true : false;
    $("#pFeaturedOrder").value = editing
      ? Math.max(1, Number(product.featuredOrder) || 1)
      : 1;
    $("#pFeaturedOrder").disabled = !$("#pFeatured").checked;
    images = editing ? safeImages(product) : [];
    previewImages();
    $("#productModal").hidden = false;
    document.body.classList.add("lock");
  }

  function closeProduct() {
    if (!$("#confirmModal").hidden) return;
    $("#productModal").hidden = true;
    document.body.classList.remove("lock");
    $("#productForm").reset();
    images = [];
  }

  function previewImages() {
    const main = images[0] || "";
    $("#upload").classList.toggle("has-image", Boolean(main));
    $("#upload").style.setProperty(
      "--preview",
      main ? `url('${main.replace(/'/g, "%27")}')` : "none",
    );
    $("#removeImage").disabled = !images.length;
    $("#imageGallery").innerHTML = images
      .map(
        (source, index) =>
          `<div class="gallery-image ${index === 0 ? "main" : ""}"><img src="${source}" alt="صورة المنتج ${index + 1}"><button class="make-main" type="button" data-main="${index}" title="اجعلها الصورة الرئيسية">${index === 0 ? "★" : "☆"}</button><button class="remove-one" type="button" data-remove="${index}" title="حذف الصورة">×</button></div>`,
      )
      .join("");
    $("#galleryCount").textContent = images.length
      ? `${fmt(images.length)} من ٨ صور — النجمة تحدد الصورة الرئيسية.`
      : "يمكنك إضافة حتى ٨ صور، واضغط النجمة لاختيار الصورة الرئيسية.";
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/"))
        return reject(new Error("INVALID_IMAGE"));
      const reader = new FileReader();
      reader.onload = () => {
        const picture = new Image();
        picture.onload = () => {
          const maximum = 1200;
          const ratio = Math.min(
            1,
            maximum / Math.max(picture.width, picture.height),
          );
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(picture.width * ratio);
          canvas.height = Math.round(picture.height * ratio);
          const context = canvas.getContext("2d");
          context.fillStyle = "#f4eee5";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(picture, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        picture.onerror = reject;
        picture.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [header, encoded] = dataUrl.split(",");
    const mime = header.match(/data:([^;]+)/)?.[1] || "image/jpeg";
    const bytes = atob(encoded);
    const array = new Uint8Array(bytes.length);
    for (let index = 0; index < bytes.length; index += 1)
      array[index] = bytes.charCodeAt(index);
    return new Blob([array], { type: mime });
  }

  async function uploadImages(productId, values) {
    const uploaded = [];
    for (const value of values.slice(0, 8)) {
      if (isStoredImage(value)) {
        uploaded.push(value);
        continue;
      }
      if (!isDataImage(value)) continue;
      const path = `products/${String(productId).replace(/[^a-zA-Z0-9_-]/g, "-")}/${crypto.randomUUID()}.jpg`;
      const { error } = await client.storage
        .from("product-images")
        .upload(path, dataUrlToBlob(value), {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });
      if (error) throw error;
      const { data } = client.storage.from("product-images").getPublicUrl(path);
      uploaded.push(data.publicUrl);
    }
    return uploaded;
  }

  async function saveProduct(product) {
    const uploaded = await uploadImages(product.id, safeImages(product));
    const record = productToDb({
      ...product,
      images: uploaded,
      image: uploaded[0] || "",
    });
    const { error } = await client
      .from("products")
      .upsert(record, { onConflict: "id" });
    if (error) throw error;
  }

  function ask(message, action) {
    $("#confirmText").textContent = message;
    pending = action;
    $("#confirmModal").hidden = false;
    document.body.classList.add("lock");
  }

  function closeAsk() {
    $("#confirmModal").hidden = true;
    pending = null;
    if ($("#productModal").hidden) document.body.classList.remove("lock");
  }

  function phoneKey(value) {
    return (
      String(value || "").replace(/\D/g, "") ||
      String(value || "")
        .trim()
        .toLowerCase()
    );
  }

  function customerRejectCount(phone) {
    const key = phoneKey(phone);
    return key
      ? orders.filter(
          (order) =>
            order.status === "rejected" && phoneKey(order.phone) === key,
        ).length
      : 0;
  }

  function statusOptions(order) {
    return Object.entries(statusLabels)
      .map(
        ([value, label]) =>
          `<option value="${value}"${order.status === value ? " selected" : ""}>${label}</option>`,
      )
      .join("");
  }

  function renderOrders() {
    stats();
    renderNewOrders();
    const filter = $("#orderFilter").value;
    const query = $("#orderSearch").value.trim().toLowerCase();
    const shown = orders.filter(
      (order) =>
        (filter === "all" || order.status === filter) &&
        (!query ||
          [
            order.id,
            order.firstName,
            order.lastName,
            order.phone,
            order.product,
          ].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          )),
    );
    if (!shown.length) {
      $("#orderList").innerHTML =
        '<div class="empty"><div><b>لا توجد طلبات هنا</b><span>سيظهر أول طلب فور إرساله من المتجر.</span></div></div>';
      return;
    }
    $("#orderList").innerHTML =
      '<div class="order-head"><span>الطلب</span><span>العميل</span><span>المنتج</span><span>الإجمالي</span><span>الحالة</span><span></span></div>' +
      shown
        .map((order) => {
          const rejects = customerRejectCount(order.phone);
          return `<article class="order-row ${rejects >= 2 ? "risky-customer" : ""}" data-id="${esc(order.dbId)}" tabindex="0" aria-label="فتح تفاصيل الطلب ${esc(order.id)}"><div><strong>${esc(order.id)}</strong><small>${esc(order.createdAt)}</small></div><div><strong>${esc(order.firstName)} ${esc(order.lastName)}</strong><small>${esc(order.phone)} · ${esc(order.location)}</small>${rejects ? `<span class="reject-chip">⚠ رفض سابق: ${fmt(rejects)}</span>` : ""}</div><div><strong>${esc(order.product)}</strong><small>${fmt(order.quantity)} قطعة · ${esc(order.size)} · ${esc(order.color)}</small></div><div class="total-cell"><strong>${fmt(order.total)} دج</strong></div><select class="status" aria-label="حالة الطلب">${statusOptions(order)}</select><button class="btn small danger delete-order">حذف</button></article>`;
        })
        .join("");
  }

  async function changeOrderStatus(order, status) {
    const { error } = await client
      .from("orders")
      .update({ status })
      .eq("id", order.dbId);
    if (error) throw error;
    markSeen(order.id);
    await Promise.all([loadProducts(), loadOrders()]);
  }

  function openOrderDetail(order) {
    if (!order) return;
    markSeen(order.id);
    const product = products.find(
      (item) => String(item.id) === String(order.productId),
    );
    const source =
      safeImage(order.productImage) || safeImages(product)[0] || "";
    const rejects = customerRejectCount(order.phone);
    $("#detailTitle").textContent = `الطلب ${order.id}`;
    $("#detailPhoto").classList.toggle("detail-empty", !source);
    $("#detailPhoto").style.setProperty(
      "--detail-image",
      source ? `url('${source.replace(/'/g, "%27")}')` : "none",
    );
    $("#detailPhoto").innerHTML = source
      ? ""
      : "<span>لا توجد صورة لهذا المنتج</span>";
    $("#detailGrid").innerHTML =
      `<div class="detail-item full"><small>المنتج</small><strong>${esc(order.product)}</strong></div><div class="detail-item"><small>العميل</small><strong>${esc(order.firstName)} ${esc(order.lastName)}</strong></div><div class="detail-item"><small>الهاتف</small><strong>${esc(order.phone)}</strong></div><div class="detail-item"><small>الولاية / المدينة</small><strong>${esc(order.location)}</strong></div><div class="detail-item"><small>الكمية والمقاس</small><strong>${fmt(order.quantity)} قطعة · ${esc(order.size)}</strong></div><div class="detail-item"><small>اللون</small><strong>${esc(order.color)}</strong></div><div class="detail-item"><small>الإجمالي</small><strong class="detail-price">${fmt(order.total)} دج</strong></div><div class="detail-item"><small>الحالة</small><strong>${esc(statusLabels[order.status] || order.status)}</strong></div><div class="detail-item"><small>مرات الرفض لهذا الهاتف</small><strong class="${rejects >= 2 ? "reject-chip" : ""}">${fmt(rejects)}</strong></div><div class="detail-item full"><small>الملاحظات</small><strong>${esc(order.notes || "لا توجد ملاحظات")}</strong></div>`;
    $("#orderDetailModal").hidden = false;
    document.body.classList.add("lock");
  }

  function closeOrderDetail() {
    $("#orderDetailModal").hidden = true;
    if ($("#productModal").hidden && $("#confirmModal").hidden)
      document.body.classList.remove("lock");
  }

  function show(view) {
    $$(".tab").forEach((tab) =>
      tab.classList.toggle("active", tab.dataset.view === view),
    );
    $$(".view").forEach(
      (section) => (section.hidden = section.id !== `${view}View`),
    );
    if (view === "products") renderProducts();
    if (view === "orders") renderOrders();
    if (view === "settings")
      setSyncState(
        `متصل — ${fmt(products.length)} منتج و${fmt(orders.length)} طلب مشترك`,
      );
  }

  function download(name, content, type) {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([content], { type }));
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(anchor.href), 200);
  }

  async function importProducts(items) {
    const validItems = items.filter(
      (item) => item && item.name && item.category,
    );
    if (!validItems.length) throw new Error("NO_PRODUCTS");
    for (let index = 0; index < validItems.length; index += 1) {
      const item = validItems[index];
      const cleanImages = safeImages(item);
      const product = {
        id: String(item.id || crypto.randomUUID()),
        name: item.name,
        price: item.price,
        oldPrice: item.oldPrice ?? item.old_price ?? 0,
        category: item.category,
        description: item.description || "",
        badge: item.badge || "",
        stock: item.stock,
        sizes: Array.isArray(item.sizes) ? item.sizes : [],
        colors: Array.isArray(item.colors) ? item.colors : [],
        visible: item.visible !== false,
        images: cleanImages,
        image: cleanImages[0] || "",
        pos: item.pos || item.image_position || "center",
        code: item.code || "",
      };
      setSyncState(
        `نقل المنتج ${fmt(index + 1)} من ${fmt(validItems.length)}…`,
      );
      await saveProduct(product);
    }
    await loadProducts();
    setSyncState(
      `اكتمل النقل — ${fmt(products.length)} منتج متاح على جميع الأجهزة`,
    );
  }

  function bindEvents() {
    $("#authForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      $("#authError").hidden = true;
      const { data, error } = await client.auth.signInWithPassword({
        email: $("#adminEmail").value.trim(),
        password: $("#adminPassword").value,
      });
      if (error) showAuth(friendlyError(error));
      else await requireAdmin(data.session);
      button.disabled = false;
    };

    $("#logout").onclick = async () => {
      await client.auth.signOut();
      location.reload();
    };
    $("#theme").onclick = () =>
      setTheme(
        document.documentElement.dataset.theme === "light" ? "dark" : "light",
      );
    $$(".tab").forEach((tab) => (tab.onclick = () => show(tab.dataset.view)));
    $("#addProduct").onclick = () => openProduct();
    $("#refreshProducts").onclick = () => refreshAll(true);
    $("#productSearch").oninput = renderProducts;
    $("#productFilter").onchange = renderProducts;

    $("#productList").onclick = (event) => {
      const row = event.target.closest("[data-id]");
      if (!row) return;
      const product = products.find(
        (item) => String(item.id) === String(row.dataset.id),
      );
      if (!product) return;
      if (event.target.closest(".edit")) openProduct(product);
      if (event.target.closest(".copy")) {
        ask(
          `سيتم إنشاء نسخة من «${product.name}». هل تريد المتابعة؟`,
          async () => {
            try {
              await saveProduct({
                ...product,
                id: crypto.randomUUID(),
                name: `${product.name} — نسخة`,
                code: product.code ? `${product.code}-COPY` : "",
                featured: false,
                featuredOrder: 0,
              });
              await loadProducts();
              toast("تم نسخ المنتج");
            } catch (error) {
              toast(friendlyError(error, "تعذر نسخ المنتج"));
            }
          },
        );
      }
      if (event.target.closest(".delete")) {
        ask(
          `سيُحذف المنتج «${product.name}» من المتجر. هل أنت متأكد؟`,
          async () => {
            const { error } = await client
              .from("products")
              .delete()
              .eq("id", product.id);
            if (error) return toast(friendlyError(error, "تعذر حذف المنتج"));
            await loadProducts();
            toast("تم حذف المنتج");
          },
        );
      }
    };

    $("#closeProduct").onclick = closeProduct;
    $("#cancelProduct").onclick = closeProduct;
    $("#productModal").onclick = (event) => {
      if (event.target === $("#productModal")) closeProduct();
    };
    $("#changeImage").onclick = () => $("#imageInput").click();
    $("#removeImage").onclick = () => {
      images = [];
      $("#imageInput").value = "";
      previewImages();
    };
    $("#imageGallery").onclick = (event) => {
      const remove = event.target.closest("[data-remove]");
      const main = event.target.closest("[data-main]");
      if (remove) images.splice(Number(remove.dataset.remove), 1);
      else if (main)
        images.unshift(images.splice(Number(main.dataset.main), 1)[0]);
      previewImages();
    };
    $("#imageInput").onchange = async (event) => {
      const files = [...event.target.files];
      const allowed = files
        .filter((file) => file.size <= 12 * 1024 * 1024)
        .slice(0, Math.max(0, 8 - images.length));
      if (!allowed.length) {
        event.target.value = "";
        return toast(
          images.length >= 8
            ? "الحد الأقصى ٨ صور"
            : "الصور أكبر من 12 ميجابايت",
        );
      }
      try {
        for (const file of allowed) images.push(await resizeImage(file));
        previewImages();
        toast(`تم تجهيز ${fmt(allowed.length)} صور للرفع`);
      } catch (_) {
        toast("تعذر قراءة إحدى الصور");
      }
      event.target.value = "";
    };

    $("#pFeatured").onchange = () => {
      $("#pFeaturedOrder").disabled = !$("#pFeatured").checked;
      if ($("#pFeatured").checked && !Number($("#pFeaturedOrder").value))
        $("#pFeaturedOrder").value = 1;
    };

    $("#productForm").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      const id = $("#pId").value || crypto.randomUUID();
      const existing =
        products.find((item) => String(item.id) === String(id)) || {};
      const product = {
        ...existing,
        id,
        name: $("#pName").value.trim(),
        price: Number($("#pPrice").value),
        oldPrice: Number($("#pOldPrice").value || 0),
        category: $("#pCategory").value,
        stock: Math.max(0, Math.floor(Number($("#pStock").value) || 0)),
        description: $("#pDescription").value.trim(),
        sizes: splitList($("#pSizes").value),
        colors: splitList($("#pColors").value),
        badge: $("#pBadge").value.trim(),
        code: $("#pCode").value.trim(),
        visible: $("#pVisible").checked,
        featured: $("#pFeatured").checked,
        featuredOrder: $("#pFeatured").checked
          ? Math.max(1, Math.floor(Number($("#pFeaturedOrder").value) || 1))
          : 0,
        images: [...images],
        image: images[0] || "",
        pos: existing.pos || "center",
      };
      try {
        button.textContent = "جاري رفع الصور والحفظ…";
        await saveProduct(product);
        closeProduct();
        await loadProducts();
        toast(
          existing.id
            ? "تم حفظ التعديل على جميع الأجهزة"
            : "تمت إضافة المنتج إلى جميع الأجهزة",
        );
      } catch (error) {
        toast(friendlyError(error, "تعذر حفظ المنتج أو رفع صوره"));
      } finally {
        button.disabled = false;
        button.textContent = "حفظ وعرض في المتجر";
      }
    };

    $("#refreshOrders").onclick = () => refreshAll(true);
    $("#orderSearch").oninput = renderOrders;
    $("#orderFilter").onchange = renderOrders;
    $("#newOrdersList").onclick = (event) => {
      const card = event.target.closest("[data-notice-id]");
      if (!card) return;
      show("orders");
      openOrderDetail(
        orders.find((order) => order.dbId === card.dataset.noticeId),
      );
    };
    $("#markAllSeen").onclick = () => {
      orders
        .filter((order) => order.status === "new")
        .forEach((order) => {
          if (!seenOrders.includes(order.id)) seenOrders.push(order.id);
        });
      saveSeen();
      renderNewOrders();
      toast("تم تحديد الطلبات كمقروءة");
    };
    $("#orderList").onchange = async (event) => {
      const row = event.target.closest("[data-id]");
      if (!row || !event.target.matches(".status")) return;
      const order = orders.find((item) => item.dbId === row.dataset.id);
      if (!order) return;
      event.target.disabled = true;
      try {
        await changeOrderStatus(order, event.target.value);
        toast(
          stockStatuses.has(event.target.value)
            ? "تم تحديث الحالة والمخزون"
            : "تم تحديث الحالة",
        );
      } catch (error) {
        toast(friendlyError(error, "تعذر تحديث حالة الطلب"));
        await loadOrders();
      }
    };
    $("#orderList").onclick = (event) => {
      const row = event.target.closest("[data-id]");
      if (!row) return;
      const order = orders.find((item) => item.dbId === row.dataset.id);
      if (event.target.closest(".delete-order")) {
        return ask(`هل تريد حذف الطلب ${order?.id || ""}؟`, async () => {
          const { error } = await client
            .from("orders")
            .delete()
            .eq("id", row.dataset.id);
          if (error) return toast(friendlyError(error, "تعذر حذف الطلب"));
          await Promise.all([loadProducts(), loadOrders()]);
          toast("تم حذف الطلب وتحديث المخزون");
        });
      }
      if (!event.target.closest("select,button")) openOrderDetail(order);
    };
    $("#orderList").onkeydown = (event) => {
      const row = event.target.closest("[data-id]");
      if (
        row &&
        !event.target.closest("select,button") &&
        (event.key === "Enter" || event.key === " ")
      ) {
        event.preventDefault();
        openOrderDetail(orders.find((order) => order.dbId === row.dataset.id));
      }
    };
    $("#closeOrderDetail").onclick = closeOrderDetail;
    $("#orderDetailModal").onclick = (event) => {
      if (event.target === $("#orderDetailModal")) closeOrderDetail();
    };

    $("#exportOrders").onclick = () => {
      if (!orders.length) return toast("لا توجد طلبات");
      const rows = [
        [
          "رقم الطلب",
          "التاريخ",
          "الاسم",
          "اللقب",
          "الهاتف",
          "المكان",
          "المنتج",
          "الكمية",
          "المقاس",
          "اللون",
          "الإجمالي",
          "الحالة",
          "مرات رفض العميل",
        ],
        ...orders.map((order) => [
          order.id,
          order.createdAt,
          order.firstName,
          order.lastName,
          order.phone,
          order.location,
          order.product,
          order.quantity,
          order.size,
          order.color,
          order.total,
          statusLabels[order.status] || order.status,
          customerRejectCount(order.phone),
        ]),
      ];
      const csv =
        "\uFEFF" +
        rows
          .map((row) =>
            row
              .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
              .join(","),
          )
          .join("\n");
      download("dar-wa-anaqa-orders.csv", csv, "text/csv;charset=utf-8");
    };

    $("#exportProducts").onclick = () =>
      download(
        "dar-wa-anaqa-products.json",
        JSON.stringify({ version: 3, source: "supabase", products }, null, 2),
        "application/json",
      );
    $("#importProducts").onclick = () => $("#importFile").click();
    $("#importFile").onchange = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const items = Array.isArray(parsed) ? parsed : parsed.products;
          if (!Array.isArray(items)) throw new Error("INVALID_FILE");
          ask(
            `سيتم إضافة أو تحديث ${fmt(items.length)} منتجًا في Supabase. هل تريد المتابعة؟`,
            async () => {
              try {
                await importProducts(items);
                toast("اكتمل استيراد المنتجات");
              } catch (error) {
                toast(friendlyError(error, "تعذر استيراد المنتجات"));
              }
            },
          );
        } catch (_) {
          toast("ملف غير صالح");
        }
      };
      reader.readAsText(file);
      event.target.value = "";
    };
    $("#migrateLocal").onclick = () => {
      if (!Array.isArray(legacyProducts) || !legacyProducts.length)
        return toast("لا توجد منتجات محلية في هذا الجهاز");
      ask(
        `سيتم نقل ${fmt(legacyProducts.length)} منتجًا محفوظًا في هذا الجهاز. هل تريد المتابعة؟`,
        async () => {
          try {
            await importProducts(legacyProducts);
            toast("تم نقل منتجات هذا الجهاز بنجاح");
          } catch (error) {
            toast(friendlyError(error, "تعذر نقل المنتجات المحلية"));
          }
        },
      );
    };

    $("#cancelConfirm").onclick = closeAsk;
    $("#approveConfirm").onclick = async () => {
      const action = pending;
      closeAsk();
      if (action) await action();
    };
    $("#confirmModal").onclick = (event) => {
      if (event.target === $("#confirmModal")) closeAsk();
    };
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (!$("#confirmModal").hidden) closeAsk();
      else if (!$("#orderDetailModal").hidden) closeOrderDetail();
      else if (!$("#productModal").hidden) closeProduct();
    });
  }

  async function init() {
    setTheme(
      localStorage.getItem("dar-theme") ||
        (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light"),
    );
    bindEvents();
    renderProducts();
    renderNewOrders();
    const { data } = await client.auth.getSession();
    await requireAdmin(data.session);
  }

  init();
})();
