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
  const LEGACY_SECTION_MARKER = "__STORE_SECTION__";
  const defaultSections = [
    { key: "kitchen", name: "المطبخ", description: "قدور وأدوات للاستخدام اليومي", order: 1 },
    { key: "table", name: "المائدة", description: "صحون وتقديم للبيت والضيوف", order: 2 },
    { key: "storage", name: "التنظيم", description: "حلول بسيطة تقلل الفوضى", order: 3 },
    { key: "home-picks", name: "مختارات البيت", description: "إكسسوارات وأجهزة صغيرة ومفاجآت مفيدة للبيت", order: 4 },
  ];
  let sections = [...defaultSections];
  let categoryLabels = Object.fromEntries(sections.map((section) => [section.key, section.name]));

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
    new Intl.NumberFormat("ar-DZ", {
      useGrouping: false,
      maximumFractionDigits: 0,
    }).format(Number(number) || 0);
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
  const isLegacySectionRow = (row) => String(row?.code || "") === LEGACY_SECTION_MARKER;
  const safeImages = (product) => {
    const values = Array.isArray(product?.images)
      ? product.images
      : [product?.image];
    return values
      .map(safeImage)
      .filter((value, index, array) => value && array.indexOf(value) === index)
      .slice(0, 8);
  };
  const sectionFromDb = (row) => ({
    id: row.id,
    key: String(row.key || "").trim(),
    name: String(row.name || row.key || "").trim(),
    description: String(row.description || "").trim(),
    order: Math.max(1, Number(row.display_order) || 999),
  });
  const effectiveSections = (rows) => {
    const custom = (rows || []).filter((section) => section.key && section.name);
    const byKey = new Map(custom.map((section) => [section.key, section]));
    defaultSections.forEach((section) => {
      if (!byKey.has(section.key)) byKey.set(section.key, section);
    });
    return [...byKey.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
  };
  const refreshCategoryLabels = () => {
    categoryLabels = Object.fromEntries(sections.map((section) => [section.key, section.name]));
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
    const themeButton = $("#themeBtn");
    $("#themeSymbol").textContent = nextTheme === "dark" ? "☾" : "☀";
    if (themeButton) {
      const isDark = nextTheme === "dark";
      themeButton.setAttribute("aria-pressed", isDark ? "true" : "false");
      themeButton.setAttribute(
        "aria-label",
        isDark
          ? "الوضع الليلي مفعّل — التبديل إلى الوضع النهاري"
          : "الوضع النهاري مفعّل — التبديل إلى الوضع الليلي",
      );
      themeButton.title = isDark ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي";
    }
    updateFeaturedProduct();
    document.querySelector('meta[name="theme-color"]').content =
      nextTheme === "dark" ? "#0c1714" : "#f5efe7";
  }

  function featuredCandidates() {
    return showcaseImages
      .filter((item) => item.image)
      .sort((first, second) => first.displayOrder - second.displayOrder)
      .slice(0, 4);
  }

  function restartFeaturedProgress() {
    const bar = $("#heroProgressBar");
    if (!bar) return;
    bar.classList.remove("running");
    void bar.offsetWidth;
    if (!reducedMotion.matches && featuredProducts.length > 1) {
      bar.classList.add("running");
    }
  }

  function stopFeaturedRotation() {
    clearInterval(featuredTimer);
    featuredTimer = null;
    $("#productWheel")?.classList.add("is-paused");
  }

  function startFeaturedRotation() {
    stopFeaturedRotation();
    $("#productWheel")?.classList.remove("is-paused");
    if (reducedMotion.matches || featuredProducts.length < 2) return;
    restartFeaturedProgress();
    featuredTimer = setInterval(
      () => setFeaturedProduct(featuredIndex + 1, false),
      5500,
    );
  }

  function setFeaturedProduct(nextIndex, restart = true) {
    if (!featuredProducts.length) return;
    featuredIndex =
      (Number(nextIndex) + featuredProducts.length) % featuredProducts.length;
    const activeIndex = featuredIndex;
    const slide = featuredProducts[activeIndex];
    const panel = $("#featuredPanel");
    const disc = $("#productWheelDisc");

    disc.querySelectorAll(".showcase-slide").forEach((item, index) => {
      const active = index === featuredIndex;
      item.classList.toggle("active", active);
      item.setAttribute("aria-hidden", active ? "false" : "true");
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
    }, reducedMotion.matches ? 0 : 140);

    $("#featureDots")
      .querySelectorAll(".wheel-dot")
      .forEach((dot, index) => {
        const active = index === featuredIndex;
        dot.classList.toggle("active", active);
        dot.setAttribute("aria-current", active ? "true" : "false");
      });

    restartFeaturedProgress();
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
      disc.innerHTML = `<span class="showcase-slide active" style="--slide-image:var(--hero-img)" aria-hidden="false"></span>`;
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
      .map(
        (slide, index) =>
          `<span class="showcase-slide${index === featuredIndex ? " active" : ""}" style="--slide-image:url('${slide.image.replace(/'/g, "%27")}')" aria-hidden="${index === featuredIndex ? "false" : "true"}"></span>`,
      )
      .join("");
    dots.innerHTML = featuredProducts
      .map(
        (slide, index) =>
          `<button class="wheel-dot${index === featuredIndex ? " active" : ""}" type="button" data-feature-index="${index}" data-thumb-number="${index + 1}" style="--thumb-image:url('${slide.image.replace(/'/g, "%27")}')" aria-label="عرض ${esc(slide.title)}" aria-current="${index === featuredIndex ? "true" : "false"}"></button>`,
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

  function productCardHtml(product, bestSold) {
    const sold = Math.max(0, Number(product.soldCount || 0));
    const isBest = sold > 0 && sold === bestSold;
    const soldBadge = sold > 0
      ? `<span class="sold-badge${isBest ? " best" : ""}">${isBest ? "الأكثر مبيعًا · " : ""}تم بيع ${format(sold)}</span>`
      : "";
    const available = Number(product.stock || 0) > 0;
    return `<article class="product-card" data-category="${esc(product.category)}" data-id="${esc(product.id)}" tabindex="0" role="button" aria-label="عرض تفاصيل ${esc(product.name)}"><div class="product-image" style="${productImageStyle(product)}">${product.badge ? `<span class="badge">${esc(product.badge)}</span>` : ""}${soldBadge}<button class="heart" type="button" aria-label="إضافة للمفضلة">♡</button></div><div class="product-info"><div><small>${esc(categoryLabels[product.category] || product.category)}</small><h3>${esc(product.name)}</h3></div><div class="price"><strong>${format(product.price)} دج</strong>${Number(product.oldPrice) > 0 ? `<del>${format(product.oldPrice)} دج</del>` : ""}</div><div class="product-actions"><button class="add" type="button"${available ? "" : " disabled"}>${available ? "＋ أضف للسلة" : "غير متوفر حاليًا"}</button></div></div></article>`;
  }

  function updateShelfGuide(shelf) {
    if (!shelf) return;
    const track = shelf.querySelector(".category-product-track");
    const guide = shelf.querySelector(".shelf-scroll-guide");
    const thumb = shelf.querySelector(".shelf-scroll-thumb");
    const count = shelf.querySelector(".shelf-scroll-count");
    const cards = [...shelf.querySelectorAll(".product-card")];
    if (!track || !guide || !thumb || !count) return;

    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const active = cards.length > 1 && maxScroll > 8;
    guide.hidden = !active;
    shelf.classList.toggle("can-scroll", active);
    if (!active) return;

    const moved = Math.abs(track.scrollLeft);
    const progress = maxScroll ? Math.max(0, Math.min(1, moved / maxScroll)) : 0;
    const guideTrack = guide.querySelector(".shelf-scroll-track");
    const guideWidth = guideTrack?.clientWidth || 0;
    const viewportRatio = Math.max(0.14, Math.min(0.55, track.clientWidth / track.scrollWidth));
    const thumbWidth = Math.max(32, guideWidth * viewportRatio);
    const travel = Math.max(0, guideWidth - thumbWidth);
    thumb.style.width = `${thumbWidth}px`;
    thumb.style.right = `${travel * progress}px`;

    const card = cards[0];
    const gap = parseFloat(getComputedStyle(track).gap) || 12;
    const step = card ? card.getBoundingClientRect().width + gap : 1;
    const current = Math.min(cards.length, Math.max(1, Math.round(moved / Math.max(1, step)) + 1));
    count.textContent = `${format(current)} / ${format(cards.length)}`;
  }

  function updateAllShelfGuides() {
    $$(".category-product-section").forEach(updateShelfGuide);
  }

  function scheduleProductScrollGuide() {
    requestAnimationFrame(() => requestAnimationFrame(updateAllShelfGuides));
  }

  function renderCategoryNavigation() {
    const nav = $("#categoryNavLinks");
    const grid = $("#categoryGrid");
    const footer = $("#footerCategoryLinks");
    if (nav) {
      const visible = sections.slice(0, 4);
      nav.innerHTML = visible
        .map((section) => `<a href="#section-${esc(section.key)}" data-section-jump="${esc(section.key)}">${esc(section.name)}</a>`)
        .join("") +
        (sections.length > 4 ? '<a href="#categories">كل الأقسام</a>' : "");
    }
    if (grid) {
      grid.innerHTML = sections
        .map((section, index) => `<button class="category-card" data-section-jump="${esc(section.key)}"><b>${twoArabicDigits(index + 1)}</b><div><small>${esc(section.description || "مختارات منتقاة لهذا الركن")}</small><strong>${esc(section.name)}</strong></div><em>←</em></button>`)
        .join("");
    }
    if (footer) {
      footer.innerHTML = sections
        .map((section) => `<a href="#section-${esc(section.key)}" data-section-jump="${esc(section.key)}">${esc(section.name)}</a>`)
        .join("") + '<a href="#offer">العروض</a>';
    }
  }

  function renderProducts(loading = false) {
    const container = $("#categoryProductSections");
    if (!container) return;
    if (loading) {
      container.innerHTML =
        '<div class="store-empty shelf-loading"><div><strong>جاري تحميل المنتجات…</strong><span>لحظات وتظهر الأقسام ومنتجاتها.</span></div></div>';
      return;
    }

    renderCategoryNavigation();
    const query = currentSearch.toLocaleLowerCase("ar");
    const visibleProducts = products.filter(
      (product) =>
        product.visible !== false &&
        (!query || String(product.name || "").toLocaleLowerCase("ar").includes(query)),
    );

    const shelves = sections
      .map((section) => {
        const items = visibleProducts.filter((product) => product.category === section.key);
        if (!items.length) return "";
        const bestSold = Math.max(0, ...items.map((product) => Number(product.soldCount || 0)));
        return `<section class="category-product-section" id="section-${esc(section.key)}" data-section="${esc(section.key)}">
          <div class="shelf-heading">
            <div>
              <p class="shelf-kicker"><span></span>${esc(section.description || "مختارات منتقاة لهذا الركن")}</p>
              <div class="shelf-title-line"><h3>${esc(section.name)}</h3><span class="shelf-count">${format(items.length)} منتجات</span></div>
            </div>
            <div class="shelf-controls" aria-label="تحريك منتجات ${esc(section.name)}">
              <button type="button" data-shelf-move="prev" aria-label="السابق">→</button>
              <button type="button" data-shelf-move="next" aria-label="التالي">←</button>
            </div>
          </div>
          <div class="category-product-track" tabindex="0" aria-label="منتجات قسم ${esc(section.name)}">
            ${items.map((product) => productCardHtml(product, bestSold)).join("")}
          </div>
          <div class="shelf-scroll-guide" aria-hidden="true" hidden>
            <span class="shelf-scroll-copy">اسحبي داخل ${esc(section.name)}</span>
            <span class="shelf-scroll-track"><span class="shelf-scroll-thumb"></span></span>
            <span class="shelf-scroll-count">١ / ${format(items.length)}</span>
          </div>
        </section>`;
      })
      .filter(Boolean)
      .join("");

    if (!shelves) {
      container.innerHTML =
        '<div class="store-empty"><div><strong>لا توجد منتجات مطابقة الآن</strong><span>جرّبي كلمة بحث أخرى أو عودي لاحقًا بعد إضافة منتجات جديدة.</span></div></div>';
      return;
    }
    container.innerHTML = shelves;
    scheduleProductScrollGuide();
  }

  async function loadSections(showError = true) {
    const { data, error } = await client
      .from("store_sections")
      .select("id,key,name,description,display_order")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      sections = [...defaultSections];
      refreshCategoryLabels();
      renderCategoryNavigation();
      if (showError) toast("تعذر تحميل الأقسام. شغّل ملف إعداد الأقسام في Supabase.");
      return false;
    }
    sections = effectiveSections((data || []).map(sectionFromDb));
    refreshCategoryLabels();
    renderCategoryNavigation();
    return true;
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
    products = (data || []).filter((row) => !isLegacySectionRow(row)).map(productFromDb);
    const knownKeys = new Set(sections.map((section) => section.key));
    [...new Set(products.map((product) => product.category).filter(Boolean))].forEach((key) => {
      if (!knownKeys.has(key)) {
        sections.push({ key, name: key, description: "مختارات هذا القسم", order: sections.length + 1 });
        knownKeys.add(key);
      }
    });
    sections.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ar"));
    refreshCategoryLabels();
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
      reloadTimer = setTimeout(async () => {
        await loadSections(false);
        await Promise.all([loadProducts(false), loadShowcase(false)]);
      }, 350);
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_sections" },
        queueReload,
      )
      .subscribe();
  }

  let foregroundRefreshTimer = 0;
  function refreshStoreFromDatabase() {
    clearTimeout(foregroundRefreshTimer);
    foregroundRefreshTimer = setTimeout(async () => {
      await loadSections(false);
      await loadProducts(false);
    }, 120);
  }

  // بعض الاستضافات لا تفعل Realtime لكل الجداول. عند العودة إلى تبويب المتجر
  // نقرأ آخر الأقسام والمنتجات مباشرة من Supabase حتى يظهر نقل المنتج فورًا.
  window.addEventListener("focus", refreshStoreFromDatabase);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshStoreFromDatabase();
  });

  function jumpToSection(key) {
    const target = document.getElementById(`section-${key}`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    else $("#products")?.scrollIntoView({ behavior: "smooth" });
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


  const mobileOrderQuery = matchMedia("(max-width: 620px)");
  let mobileOrderThumbDrag = null;

  function mobileOrderFormIsActive() {
    return (
      mobileOrderQuery.matches &&
      !$("#orderModal").hidden &&
      $("#orderLayout").classList.contains("ordering") &&
      !$("#orderFormWrap").hidden
    );
  }

  function updateMobileOrderScrollbar() {
    const bar = $("#mobileOrderScrollbar");
    const thumb = $("#mobileOrderScrollThumb");
    const formWrap = $("#orderFormWrap");
    if (!bar || !thumb || !formWrap) return;

    const active = mobileOrderFormIsActive();
    bar.hidden = !active;
    bar.classList.toggle("active", active);
    if (!active) return;

    const track = bar.querySelector(".mobile-order-scroll-track");
    const trackHeight = track?.clientHeight || 0;
    const viewport = formWrap.clientHeight || 0;
    const content = formWrap.scrollHeight || 0;

    if (!trackHeight || !viewport || content <= viewport + 2) {
      bar.classList.remove("active");
      bar.hidden = true;
      return;
    }

    const minThumb = 46;
    const thumbHeight = Math.max(
      minThumb,
      Math.min(trackHeight, trackHeight * (viewport / content)),
    );
    const maxScroll = Math.max(1, content - viewport);
    const maxThumbTravel = Math.max(0, trackHeight - thumbHeight);
    const progress = Math.max(0, Math.min(1, formWrap.scrollTop / maxScroll));

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translate3d(0, ${maxThumbTravel * progress}px, 0)`;
  }

  function beginMobileOrderThumbDrag(event) {
    if (!mobileOrderFormIsActive()) return;
    const thumb = $("#mobileOrderScrollThumb");
    const bar = $("#mobileOrderScrollbar");
    const formWrap = $("#orderFormWrap");
    const track = bar?.querySelector(".mobile-order-scroll-track");
    if (!thumb || !track || !formWrap) return;

    event.preventDefault();
    const trackHeight = track.clientHeight;
    const thumbHeight = thumb.getBoundingClientRect().height;
    const maxThumbTravel = Math.max(1, trackHeight - thumbHeight);
    const maxScroll = Math.max(1, formWrap.scrollHeight - formWrap.clientHeight);

    mobileOrderThumbDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: formWrap.scrollTop,
      scrollPerPixel: maxScroll / maxThumbTravel,
    };

    try {
      thumb.setPointerCapture(event.pointerId);
    } catch (_) {}
  }

  function moveMobileOrderThumb(event) {
    if (!mobileOrderThumbDrag || event.pointerId !== mobileOrderThumbDrag.pointerId)
      return;
    event.preventDefault();
    const formWrap = $("#orderFormWrap");
    formWrap.scrollTop =
      mobileOrderThumbDrag.startScrollTop +
      (event.clientY - mobileOrderThumbDrag.startY) *
        mobileOrderThumbDrag.scrollPerPixel;
  }

  function endMobileOrderThumbDrag(event) {
    if (!mobileOrderThumbDrag || event.pointerId !== mobileOrderThumbDrag.pointerId)
      return;
    mobileOrderThumbDrag = null;
  }

  function openOrder(productId, quantity) {
    activeProduct = products.find(
      (product) => String(product.id) === String(productId),
    );
    if (!activeProduct) return;
    closeCart();
    $("#orderProductName").textContent = activeProduct.name;
    $("#orderProductPrice").textContent = `${format(activeProduct.price)} دج`;
    const description = String(activeProduct.description || "").trim();
    $("#orderProductDescription").textContent = description;
    $("#orderProductDescription").hidden = !description;
    prepareGallery(activeProduct);
    restoreOrderDraft(activeProduct, quantity);
    updateOrderTotal();
    hidePurchaseConfirmation();

    const available = Number(activeProduct.stock || 0) > 0;
    const orderButton = $("#showOrderForm");
    orderButton.hidden = false;
    orderButton.disabled = !available;
    orderButton.textContent = available ? "أطلب الآن" : "المنتج غير متوفر حاليًا";
    $("#orderFormWrap").hidden = true;
    $("#orderLayout").classList.remove("ordering");

    $("#orderModal").hidden = false;
    setLocked(true);
    requestAnimationFrame(updateMobileOrderScrollbar);
  }

  function showOrderForm() {
    if (!activeProduct) return;
    if (Number(activeProduct.stock || 0) <= 0)
      return toast("هذا المنتج غير متوفر حاليًا");
    $("#orderFormWrap").hidden = false;
    $("#orderLayout").classList.add("ordering");
    $("#showOrderForm").hidden = true;
    updateOrderTotal();

    requestAnimationFrame(() => {
      const layout = $("#orderLayout");
      const formWrap = $("#orderFormWrap");

      if (mobileOrderQuery.matches) {
        layout.scrollTop = 0;
        formWrap.scrollTop = 0;
        updateMobileOrderScrollbar();
      } else {
        const layoutBox = layout.getBoundingClientRect();
        const formBox = formWrap.getBoundingClientRect();
        const targetTop = Math.max(
          0,
          layout.scrollTop + formBox.top - layoutBox.top - 12,
        );
        layout.scrollTo({
          top: targetTop,
          behavior: reducedMotion.matches ? "auto" : "smooth",
        });
      }

      setTimeout(() => {
        try {
          $("#firstName").focus({ preventScroll: true });
        } catch (_) {
          $("#firstName").focus();
        }
        updateMobileOrderScrollbar();
      }, reducedMotion.matches ? 0 : 220);
    });
  }

  function closeOrder(saveDraft = true) {
    if (saveDraft) captureOrderDraft();
    hidePurchaseConfirmation();
    $("#orderModal").hidden = true;
    $("#orderFormWrap").hidden = true;
    $("#orderLayout").classList.remove("ordering");
    $("#showOrderForm").hidden = false;
    const mobileBar = $("#mobileOrderScrollbar");
    if (mobileBar) {
      mobileBar.hidden = true;
      mobileBar.classList.remove("active");
    }
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
    $("#themeBtn").onclick = () => {
      const nextTheme = theme === "light" ? "dark" : "light";
      if (document.startViewTransition && !reducedMotion.matches) {
        document.startViewTransition(() => setTheme(nextTheme));
      } else {
        setTheme(nextTheme);
      }
    };
    window.addEventListener("resize", scheduleProductScrollGuide, { passive: true });
    window.addEventListener("orientationchange", () => setTimeout(scheduleProductScrollGuide, 120), { passive: true });

    $("#menuBtn").onclick = () => $("#nav").classList.add("open");
    $("#closeMenu").onclick = () => $("#nav").classList.remove("open");
    $("#nav").addEventListener("click", (event) => {
      const anchor = event.target.closest("a");
      if (anchor) $("#nav").classList.remove("open");
    });
    $("#searchBtn").onclick = () => {
      $("#searchBar").hidden = !$("#searchBar").hidden;
      if (!$("#searchBar").hidden) $("#searchBar input").focus();
    };
    $("#closeSearch").onclick = () => ($("#searchBar").hidden = true);
    $("#searchBar input").oninput = (event) => {
      currentSearch = event.target.value.trim();
      renderProducts();
    };
    document.addEventListener("click", (event) => {
      const jump = event.target.closest("[data-section-jump]");
      if (jump) {
        event.preventDefault();
        jumpToSection(jump.dataset.sectionJump);
      }
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
    let showcaseTouchX = null;
    $("#productWheel").addEventListener(
      "touchstart",
      (event) => {
        showcaseTouchX = event.touches[0]?.clientX ?? null;
        stopFeaturedRotation();
      },
      { passive: true },
    );
    $("#productWheel").addEventListener(
      "touchend",
      (event) => {
        const endX = event.changedTouches[0]?.clientX;
        if (showcaseTouchX !== null && Number.isFinite(endX)) {
          const delta = endX - showcaseTouchX;
          if (Math.abs(delta) > 45) {
            setFeaturedProduct(featuredIndex + (delta < 0 ? 1 : -1));
          } else {
            startFeaturedRotation();
          }
        } else {
          startFeaturedRotation();
        }
        showcaseTouchX = null;
      },
      { passive: true },
    );
    reducedMotion.addEventListener?.("change", startFeaturedRotation);
    $("#categoryProductSections").addEventListener("scroll", (event) => {
      const track = event.target.closest?.(".category-product-track");
      if (track) requestAnimationFrame(() => updateShelfGuide(track.closest(".category-product-section")));
    }, true);
    $("#categoryProductSections").onclick = (event) => {
      const move = event.target.closest("[data-shelf-move]");
      if (move) {
        const shelf = move.closest(".category-product-section");
        const track = shelf?.querySelector(".category-product-track");
        const card = track?.querySelector(".product-card");
        if (track && card) {
          const gap = parseFloat(getComputedStyle(track).gap) || 12;
          const amount = (card.getBoundingClientRect().width + gap) * 2;
          track.scrollBy({ left: move.dataset.shelfMove === "next" ? -amount : amount, behavior: "smooth" });
        }
        return;
      }
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
    $("#categoryProductSections").onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".product-card");
      if (!card || event.target.closest("button")) return;
      event.preventDefault();
      openOrder(card.dataset.id);
    };
    $("#showOrderForm").onclick = showOrderForm;
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

    $("#orderFormWrap").addEventListener("scroll", updateMobileOrderScrollbar, {
      passive: true,
    });
    window.addEventListener("resize", () =>
      requestAnimationFrame(updateMobileOrderScrollbar),
    );
    window.addEventListener("orientationchange", () =>
      setTimeout(updateMobileOrderScrollbar, 120),
    );
    if (mobileOrderQuery.addEventListener)
      mobileOrderQuery.addEventListener("change", updateMobileOrderScrollbar);

    const mobileScrollThumb = $("#mobileOrderScrollThumb");
    if (mobileScrollThumb) {
      mobileScrollThumb.onpointerdown = beginMobileOrderThumbDrag;
      mobileScrollThumb.onpointermove = moveMobileOrderThumb;
      mobileScrollThumb.onpointerup = endMobileOrderThumbDrag;
      mobileScrollThumb.onpointercancel = endMobileOrderThumbDrag;
    }

    const mobileScrollBar = $("#mobileOrderScrollbar");
    if (mobileScrollBar) {
      mobileScrollBar.onclick = (event) => {
        if (!mobileOrderFormIsActive() || event.target === mobileScrollThumb) return;
        const track = mobileScrollBar.querySelector(".mobile-order-scroll-track");
        const formWrap = $("#orderFormWrap");
        if (!track || !formWrap) return;
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(
          0,
          Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)),
        );
        formWrap.scrollTo({
          top: ratio * Math.max(0, formWrap.scrollHeight - formWrap.clientHeight),
          behavior: reducedMotion.matches ? "auto" : "smooth",
        });
      };
    }

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
    renderCategoryNavigation();
    renderProducts(true);
    updateCart();
    await loadSections(true);
    await Promise.all([loadProducts(true), loadShowcase(true)]);
    subscribeRealtime();
  }

  init();
})();
