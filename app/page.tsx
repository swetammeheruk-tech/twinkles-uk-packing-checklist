"use client";

import { ChangeEvent, CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient, SupabaseClient, User } from "@supabase/supabase-js";

type Priority = "Essential" | "Important" | "Optional";
type Bag = "Hand Luggage" | "Checked Bag 1" | "Checked Bag 2" | "Personal Bag" | "Buy in UK";
type Status = "Not Packed" | "Packed" | "Need to Buy" | "Buy in UK";
type Source = "Pack from India" | "Buy in UK" | "Undecided";
type Tab = "overview" | "checklist" | "bags" | "buy" | "travel" | "cloud";

type Item = {
  id: string;
  name: string;
  qty: number;
  priority: Priority;
  bag: Bag;
  status: Status;
  notes: string;
  source: Source;
};

type Category = {
  id: string;
  name: string;
  icon: string;
  note?: string;
  collapsed?: boolean;
  items: Item[];
};

type TravelList = {
  id: string;
  title: string;
  icon: string;
  items: { id: string; name: string; done: boolean }[];
};

type WeightInfo = { current: number; allowance: number };

type AppState = {
  categories: Category[];
  travelLists: TravelList[];
  weights: Record<string, WeightInfo>;
  dismissedSuggestions: string[];
};

const storageKey = "twinkles-uk-packing-checklist-v1";
const cloudSettingsKey = "twinkles-cloud-settings-v1";
const cloudChecklistKey = "twinkles-cloud-checklist-id-v1";
const sharedChecklistKey = "twinkle-main";

const bags: Bag[] = ["Hand Luggage", "Checked Bag 1", "Checked Bag 2", "Personal Bag", "Buy in UK"];
const priorities: Priority[] = ["Essential", "Important", "Optional"];
const statuses: Status[] = ["Not Packed", "Packed", "Need to Buy", "Buy in UK"];
const sources: Source[] = ["Pack from India", "Buy in UK", "Undecided"];

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const normalizeSupabaseUrl = (value: string) =>
  value
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "")
    .replace("bjvmiqsspriiqjfltznw.supabase.co", "bjvmiqsspriiqjfltznu.supabase.co");
const defaultSupabaseUrl = "https://bjvmiqsspriiqjfltznu.supabase.co";
const defaultSupabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqdm1pcXNzcHJpaXFqZmx0em51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMDM4NjksImV4cCI6MjEwMTg3OTg2OX0.a8G_FoyPv60IJ0e7l3WEVnZAuWWXNuSFV8deR5XU1mc";
const friendlyCloudError = (message: string) => {
  if (/failed to fetch/i.test(message)) {
    return "Could not reach Supabase. Check that the project URL is the base URL, the anon key is correct, and Anonymous sign-ins are enabled.";
  }
  return message;
};
const bundledSupabaseUrl = normalizeSupabaseUrl(env.VITE_SUPABASE_URL ?? defaultSupabaseUrl);
const bundledSupabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY ?? defaultSupabaseAnonKey).trim();

const defaultItem = (name: string, priority: Priority = "Important", bag: Bag = "Checked Bag 1", status: Status = "Not Packed", source: Source = "Pack from India"): Item => ({
  id: makeId("item"),
  name,
  qty: 1,
  priority,
  bag,
  status,
  notes: "",
  source,
});

const category = (name: string, icon: string, items: Item[], note?: string): Category => ({
  id: makeId("cat"),
  name,
  icon,
  items,
  note,
});

function freshState(): AppState {
  return {
    categories: [
      category("Documents", "📄", [
        defaultItem("Passport", "Essential", "Hand Luggage"),
        defaultItem("UK Visa / eVisa details", "Essential", "Hand Luggage"),
        defaultItem("Flight Ticket", "Essential", "Hand Luggage"),
        defaultItem("Boarding Pass", "Essential", "Hand Luggage"),
        defaultItem("Marriage Certificate", "Essential", "Hand Luggage"),
        defaultItem("TB Certificate", "Essential", "Hand Luggage"),
        defaultItem("Visa Decision Letter", "Essential", "Hand Luggage"),
        defaultItem("UK Accommodation Letter", "Essential", "Hand Luggage"),
        defaultItem("Husband/Partner UK Address", "Essential", "Hand Luggage"),
        defaultItem("Travel Insurance", "Important", "Hand Luggage"),
        defaultItem("Bank Statements", "Important", "Hand Luggage"),
        defaultItem("Educational Certificates", "Important", "Checked Bag 1"),
        defaultItem("Employment Documents if applicable", "Important", "Checked Bag 1"),
        defaultItem("Passport-size photographs", "Important", "Hand Luggage"),
        defaultItem("Photocopies of important documents", "Important", "Checked Bag 1"),
      ]),
      category("Clothes", "👗", [
        "T-Shirts", "Shirts/Tops", "Jeans", "Trousers", "Leggings", "Dresses", "Nightwear", "Innerwear", "Socks",
        "Sweaters", "Hoodies", "Jackets", "Waterproof Jacket", "Thermal Wear", "Traditional Indian Clothes",
        "Formal Clothes", "Scarf", "Gloves", "Winter Cap",
      ].map((name) => defaultItem(name, ["Waterproof Jacket", "Thermal Wear", "Jackets"].includes(name) ? "Essential" : "Important"))),
      category("Footwear", "👟", ["Everyday Shoes", "Trainers", "Sandals", "Slippers", "Formal Shoes", "Waterproof Shoes"].map((name) => defaultItem(name))),
      category("Electronics", "🔌", [
        defaultItem("Mobile Phone", "Essential", "Hand Luggage"),
        defaultItem("Laptop", "Important", "Hand Luggage"),
        defaultItem("Laptop Charger", "Essential", "Hand Luggage"),
        defaultItem("Mobile Charger", "Essential", "Hand Luggage"),
        defaultItem("Power Bank", "Essential", "Hand Luggage"),
        defaultItem("Earphones / Headphones", "Important", "Hand Luggage"),
        defaultItem("Smartwatch", "Optional", "Personal Bag"),
        defaultItem("Smartwatch Charger", "Optional", "Personal Bag"),
        defaultItem("UK Plug Adapter", "Essential", "Hand Luggage"),
        defaultItem("Universal Travel Adapter", "Important", "Hand Luggage"),
        defaultItem("USB / USB-C Cables", "Important", "Hand Luggage"),
        defaultItem("External Hard Drive", "Optional", "Checked Bag 1"),
        defaultItem("Hair Dryer if required", "Optional", "Checked Bag 2"),
      ], "UK uses Type G three-pin plugs. Check whether appliances support 220-240V before using them in the UK."),
      category("Personal Care", "🧴", [
        "Toothbrush", "Toothpaste", "Face Wash", "Moisturiser", "Shampoo", "Conditioner", "Body Wash", "Soap",
        "Deodorant", "Perfume", "Comb / Hairbrush", "Hair Oil", "Hair Accessories", "Sanitary Products", "Makeup",
        "Makeup Remover", "Nail Cutter", "Razor / Trimmer", "Lip Balm", "Sunscreen",
      ].map((name) => defaultItem(name))),
      category("Medicines & Health", "💊", [
        defaultItem("Regular Prescription Medicines", "Essential", "Hand Luggage"),
        defaultItem("Prescription / Doctor's Letter", "Essential", "Hand Luggage"),
        defaultItem("Paracetamol", "Important", "Hand Luggage"),
        defaultItem("Cold & Flu Medicine", "Important", "Checked Bag 1"),
        defaultItem("Allergy Medicine", "Important", "Checked Bag 1"),
        defaultItem("Antacid", "Important", "Checked Bag 1"),
        defaultItem("ORS", "Important", "Checked Bag 1"),
        defaultItem("Pain Relief Balm", "Important", "Checked Bag 1"),
        defaultItem("Band-Aids", "Important", "Checked Bag 1"),
        defaultItem("Basic First Aid Items", "Important", "Checked Bag 1"),
        defaultItem("Glasses", "Essential", "Personal Bag"),
        defaultItem("Spare Glasses", "Important", "Checked Bag 1"),
        defaultItem("Contact Lens Supplies", "Important", "Personal Bag"),
      ], "Keep important prescription medicines and supporting prescriptions/doctor's letters in hand luggage where appropriate. Check UK rules before carrying controlled or restricted medicines."),
      category("Food & Indian Essentials", "🍲", [
        "Favourite Indian Snacks", "Masala / Spices", "Tea", "Homemade Dry Food", "Ready-to-Eat Food", "Pickles if permitted", "Small Kitchen Essentials",
      ].map((name) => defaultItem(name, "Optional")), "Check current UK customs and border rules before packing food, dairy, meat, plants, seeds or other restricted items."),
      category("Hand Luggage", "👜", [
        defaultItem("Wallet", "Essential", "Hand Luggage"),
        defaultItem("Debit/Credit Cards", "Essential", "Hand Luggage"),
        defaultItem("Some GBP Cash", "Important", "Hand Luggage"),
        defaultItem("Jewellery / Valuables", "Essential", "Hand Luggage"),
        defaultItem("One Change of Clothes", "Important", "Hand Luggage"),
        defaultItem("Travel-size Toiletries", "Important", "Hand Luggage"),
        defaultItem("Snacks", "Optional", "Hand Luggage"),
        defaultItem("Water Bottle after security", "Optional", "Hand Luggage"),
        defaultItem("Neck Pillow", "Optional", "Hand Luggage"),
      ]),
      category("UK Setup Items", "🏠", [
        "UK SIM information", "UK Address", "Emergency Contact Details", "Bank Cards", "Driving Licence",
        "International Driving Permit if applicable", "Copies of Certificates", "Initial Grocery List", "Important Phone Numbers",
      ].map((name) => defaultItem(name, name.includes("Address") || name.includes("Emergency") ? "Essential" : "Important", name.includes("Initial") ? "Buy in UK" : "Hand Luggage", name.includes("Initial") ? "Buy in UK" : "Not Packed", name.includes("Initial") ? "Buy in UK" : "Pack from India"))),
      category("Gifts", "🎁", ["Gifts for Family", "Gifts for Friends", "Indian Sweets if permitted", "Souvenirs"].map((name) => defaultItem(name, "Optional"))),
      category("Miscellaneous", "🧳", ["Umbrella", "Sunglasses", "Small Backpack", "Handbag", "Travel Pillow", "Luggage Locks", "Luggage Tags", "Sewing Kit", "Reusable Shopping Bag", "Water Bottle"].map((name) => defaultItem(name, "Important"))),
      category("Buy After Arriving in UK", "🛍️", [
        "Duvet", "Pillows", "Large Shampoo Bottles", "Cleaning Supplies", "Heavy Kitchen Equipment", "Additional Winter Coat",
      ].map((name) => defaultItem(name, "Optional", "Buy in UK", "Buy in UK", "Buy in UK"))),
    ],
    travelLists: [
      {
        id: "before-home",
        title: "Before Leaving India",
        icon: "🏠",
        items: [
          "Passport checked", "Visa/eVisa information checked", "Flight status checked", "Online check-in completed",
          "Boarding passes saved", "Luggage weighed", "Luggage tags attached", "Important documents in hand luggage",
          "Medicines packed", "Chargers packed", "Power bank in hand luggage", "UK address saved offline",
          "Emergency contacts saved", "Indian SIM roaming checked", "UK transport plan checked", "Airport transfer confirmed",
          "House keys handed over if needed",
        ].map((name) => ({ id: makeId("travel"), name, done: false })),
      },
      {
        id: "boarding",
        title: "Airport Final Check",
        icon: "✈️",
        items: ["Passport", "Boarding Pass", "Phone", "Wallet", "Visa Documents", "Hand Luggage", "Checked Bags dropped", "Gate checked", "Water/Snacks", "Phone charged"].map((name) => ({ id: makeId("travel"), name, done: false })),
      },
      {
        id: "arrival",
        title: "After Landing in the UK",
        icon: "🇬🇧",
        items: [
          "Complete immigration", "Collect checked luggage", "Check luggage for damage", "Connect to Wi-Fi/mobile network",
          "Contact Swetam", "Follow airport pickup instructions", "Keep passport accessible", "Reach UK accommodation",
          "Check eVisa/immigration account if necessary", "Set up UK SIM", "Register with GP when appropriate",
          "Start UK bank/account setup if needed", "Purchase remaining household essentials",
        ].map((name) => ({ id: makeId("travel"), name, done: false })),
      },
    ],
    weights: {
      "Checked Bag 1": { current: 20.4, allowance: 23 },
      "Checked Bag 2": { current: 15, allowance: 23 },
      "Hand Luggage": { current: 6.8, allowance: 7 },
      "Personal Bag": { current: 2.2, allowance: 5 },
    },
    dismissedSuggestions: [],
  };
}

function usePackingState() {
  const [state, setState] = useState<AppState>(() => freshState());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setState(JSON.parse(saved) as AppState);
      } catch {
        setState(freshState());
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(storageKey, JSON.stringify(state));
  }, [ready, state]);

  return [state, setState] as const;
}

export default function Home() {
  const [state, setState] = usePackingState();
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [bagFilter, setBagFilter] = useState("All Bags");
  const [selectedBag, setSelectedBag] = useState<Bag>("Hand Luggage");
  const [editing, setEditing] = useState<{ item: Item; categoryId: string } | null>(null);
  const [newItemCategory, setNewItemCategory] = useState<string | null>(null);
  const [quickName, setQuickName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [cloudUrl, setCloudUrl] = useState(bundledSupabaseUrl);
  const [cloudKey, setCloudKey] = useState(bundledSupabaseAnonKey);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudStatus, setCloudStatus] = useState("Local autosave is active.");
  const [cloudChecklistId, setCloudChecklistId] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const cloudHydrating = useRef(false);
  const latestCloudUpdatedAt = useRef("");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [tab]);

  const supabase = useMemo<SupabaseClient | null>(() => {
    const normalizedUrl = normalizeSupabaseUrl(cloudUrl);
    const normalizedKey = cloudKey.trim();
    if (!normalizedUrl || !normalizedKey) return null;
    return createClient(normalizedUrl, normalizedKey, {
      auth: {
        persistSession: true,
        storageKey: "twinkles-packing-cloud-auth",
      },
    });
  }, [cloudUrl, cloudKey]);

  useEffect(() => {
    const saved = localStorage.getItem(cloudSettingsKey);
    const checklistId = localStorage.getItem(cloudChecklistKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { url?: string; key?: string };
        setCloudUrl(normalizeSupabaseUrl(parsed.url || bundledSupabaseUrl));
        setCloudKey((parsed.key || bundledSupabaseAnonKey).trim());
      } catch {
        setCloudUrl(bundledSupabaseUrl);
        setCloudKey(bundledSupabaseAnonKey);
      }
    }
    if (checklistId) setCloudChecklistId(checklistId);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setCloudUser(null);
      setCloudStatus("Connect Supabase Free to sync across devices.");
      return;
    }

    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        setCloudUser(data.user);
        setCloudStatus("Cloud sync is ready.");
        return;
      }
      setCloudStatus("Starting cloud sync...");
      const { data: anonymousData, error } = await supabase.auth.signInAnonymously();
      setCloudUser(anonymousData.user ?? null);
      setCloudStatus(error ? friendlyCloudError(error.message) : "Cloud sync is ready.");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setCloudUser(session?.user ?? null);
      setCloudStatus(session?.user ? "Cloud sync is ready." : "Signed out. Local autosave is still active.");
    });

    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const allItems = useMemo(() => state.categories.flatMap((cat) => cat.items.map((item) => ({ ...item, categoryId: cat.id, categoryName: cat.name, categoryIcon: cat.icon }))), [state.categories]);
  const packedCount = allItems.filter((item) => item.status === "Packed").length;
  const remainingCount = allItems.length - packedCount;
  const essentialRemaining = allItems.filter((item) => item.priority === "Essential" && item.status !== "Packed").length;
  const progress = allItems.length ? Math.round((packedCount / allItems.length) * 100) : 0;
  const essentialItems = allItems.filter((item) => item.priority === "Essential" && item.status !== "Packed");
  const buyItems = allItems.filter((item) => item.source === "Buy in UK" || item.status === "Buy in UK" || item.bag === "Buy in UK");
  const handLuggage = allItems.filter((item) => item.bag === "Hand Luggage");
  const handCore = ["Passport", "Visa", "Boarding Pass", "Phone", "Wallet", "Medicines", "Charger", "Power Bank", "UK Address", "Emergency"];
  const handReady = handCore.filter((term) => handLuggage.some((item) => item.name.toLowerCase().includes(term.toLowerCase()) && item.status === "Packed")).length;

  const suggestions = useMemo(() => {
    const has = (text: string) => allItems.some((item) => item.name.toLowerCase().includes(text.toLowerCase()));
    const packed = (text: string) => allItems.some((item) => item.name.toLowerCase().includes(text.toLowerCase()) && item.status === "Packed");
    const unpacked = (text: string) => allItems.some((item) => item.name.toLowerCase().includes(text.toLowerCase()) && item.status !== "Packed");
    const ideas = [
      packed("mobile phone") && unpacked("mobile charger") ? "Twinkle has packed her phone but her phone charger is still not packed." : "",
      has("laptop") && !has("UK Plug Adapter") ? "You added a laptop but no UK plug adapter." : "",
      packed("Regular Prescription Medicines") && !has("Prescription") ? "Prescription medicines are packed but no prescription document has been added." : "",
      ["Thermal Wear", "Waterproof Jacket", "Gloves", "Winter Cap"].some(unpacked) ? "Winter clothes are incomplete." : "",
      unpacked("Passport") || unpacked("Visa") ? "Keep passport and visa documents at the top of hand luggage." : "",
    ].filter(Boolean);
    return ideas.filter((idea) => !state.dismissedSuggestions.includes(idea));
  }, [allItems, state.dismissedSuggestions]);

  const filteredCategories = state.categories
    .map((cat) => ({
      ...cat,
      items: cat.items.filter((item) => {
        const text = `${item.name} ${item.notes}`.toLowerCase();
        const matchesSearch = text.includes(query.toLowerCase());
        const matchesFilter =
          filter === "All" ||
          (filter === "Remaining" && item.status !== "Packed") ||
          (filter === "Packed" && item.status === "Packed") ||
          (filter === "Essential" && item.priority === "Essential") ||
          (filter === "Need to Buy" && item.status === "Need to Buy") ||
          (filter === "Buy in UK" && (item.status === "Buy in UK" || item.source === "Buy in UK"));
        const matchesCategory = categoryFilter === "All Categories" || cat.name === categoryFilter;
        const matchesBag = bagFilter === "All Bags" || item.bag === bagFilter;
        return matchesSearch && matchesFilter && matchesCategory && matchesBag;
      }),
    }))
    .filter((cat) => cat.items.length || categoryFilter === cat.name || (!query && filter === "All" && bagFilter === "All Bags" && categoryFilter === "All Categories"));

  const updateCategory = (categoryId: string, updater: (cat: Category) => Category) => {
    setState((current) => ({ ...current, categories: current.categories.map((cat) => (cat.id === categoryId ? updater(cat) : cat)) }));
  };

  const updateItem = (categoryId: string, itemId: string, patch: Partial<Item>) => {
    updateCategory(categoryId, (cat) => ({ ...cat, items: cat.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) }));
  };

  const moveItem = (fromCategoryId: string, itemId: string, targetCategoryId: string, patch: Partial<Item> = {}) => {
    setState((current) => {
      const moving = current.categories.find((cat) => cat.id === fromCategoryId)?.items.find((item) => item.id === itemId);
      if (!moving) return current;
      return {
        ...current,
        categories: current.categories.map((cat) => {
          if (cat.id === fromCategoryId) return { ...cat, items: cat.items.filter((item) => item.id !== itemId) };
          if (cat.id === targetCategoryId) return { ...cat, items: [...cat.items, { ...moving, ...patch }] };
          return cat;
        }),
      };
    });
  };

  const addQuickItem = (event: FormEvent, categoryId: string) => {
    event.preventDefault();
    if (!quickName.trim()) return;
    updateCategory(categoryId, (cat) => ({ ...cat, items: [...cat.items, defaultItem(quickName.trim())] }));
    setQuickName("");
    setNewItemCategory(null);
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "twinkles-uk-packing-checklist.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AppState;
        if (Array.isArray(parsed.categories)) setState(parsed);
      } catch {
        alert("That backup file could not be imported.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  };

  const copyChecklist = async () => {
    const text = state.categories.map((cat) => `${cat.icon} ${cat.name}\n${cat.items.map((item) => `${item.status === "Packed" ? "[x]" : "[ ]"} ${item.name} (${item.qty}) - ${item.priority} - ${item.bag}`).join("\n")}`).join("\n\n");
    await navigator.clipboard.writeText(text);
    alert("Checklist copied.");
  };

  const resetAll = () => {
    if (confirm("Are you sure you want to reset Twinkle’s packing checklist? All packing progress and custom items will be removed.")) {
      setState(freshState());
      setTab("overview");
    }
  };

  const saveCloudSettings = () => {
    const normalizedUrl = normalizeSupabaseUrl(cloudUrl);
    const normalizedKey = cloudKey.trim();
    if (!normalizedUrl || !normalizedKey) {
      setCloudStatus("Add your Supabase URL and anon key first.");
      return;
    }
    localStorage.setItem(cloudSettingsKey, JSON.stringify({ url: normalizedUrl, key: normalizedKey }));
    setCloudUrl(normalizedUrl);
    setCloudKey(normalizedKey);
    setCloudStatus("Supabase settings saved. Start cloud sync when ready.");
  };

  const startCloudSync = async () => {
    if (!supabase) return;
    setCloudBusy(true);
    setCloudStatus("Starting cloud sync...");
    const { error } = await supabase.auth.signInAnonymously();
    setCloudBusy(false);
    setCloudStatus(error ? friendlyCloudError(error.message) : "Cloud sync started. Save this checklist to create the server copy.");
  };

  const saveToCloud = useCallback(async (silent = false) => {
    if (!supabase || !cloudUser) {
      if (!silent) setCloudStatus("Sign in to save this checklist to the server.");
      return;
    }
    if (!silent) setCloudBusy(true);
    if (!silent) setCloudStatus("Saving checklist to cloud...");

    const payload = {
      owner_id: cloudUser.id,
      share_key: sharedChecklistKey,
      title: "Twinkle UK Packing Checklist",
      state,
      updated_at: new Date().toISOString(),
    };

    const result = await supabase
      .from("packing_checklists")
      .upsert(payload, { onConflict: "share_key" })
      .select("id,updated_at")
      .single();

    if (!silent) setCloudBusy(false);
    if (result.error) {
      setCloudStatus(friendlyCloudError(result.error.message));
      return;
    }

    const id = result.data?.id as string | undefined;
    const updatedAt = result.data?.updated_at as string | undefined;
    if (id) {
      setCloudChecklistId(id);
      localStorage.setItem(cloudChecklistKey, id);
    }
    if (updatedAt) latestCloudUpdatedAt.current = updatedAt;
    setCloudStatus(silent ? "Cloud autosaved." : "Checklist saved to cloud.");
  }, [cloudUser, state, supabase]);

  const loadFromCloud = async () => {
    if (!supabase || !cloudUser) {
      setCloudStatus("Sign in to load your cloud checklist.");
      return;
    }
    setCloudBusy(true);
    setCloudStatus("Loading checklist from cloud...");

    const query = supabase
      .from("packing_checklists")
      .select("id,state,updated_at")
      .eq("share_key", sharedChecklistKey)
      .order("updated_at", { ascending: false })
      .limit(1);
    const result = await query;

    setCloudBusy(false);
    if (result.error) {
      setCloudStatus(friendlyCloudError(result.error.message));
      return;
    }
    const row = result.data?.[0];
    if (!row) {
      setCloudStatus("Creating shared cloud checklist...");
      void saveToCloud(true);
      return;
    }
    cloudHydrating.current = true;
    setState(row.state as AppState);
    setCloudChecklistId(row.id);
    latestCloudUpdatedAt.current = row.updated_at;
    localStorage.setItem(cloudChecklistKey, row.id);
    setCloudStatus("Cloud checklist loaded.");
    window.setTimeout(() => {
      cloudHydrating.current = false;
    }, 800);
  };

  const deleteCloudChecklist = async () => {
    if (!supabase || !cloudUser) {
      setCloudStatus("No cloud checklist is selected.");
      return;
    }
    if (!confirm("Delete the cloud copy of this checklist? Your local browser copy will remain.")) return;
    setCloudBusy(true);
    const { error } = await supabase.from("packing_checklists").delete().eq("share_key", sharedChecklistKey);
    setCloudBusy(false);
    if (error) {
      setCloudStatus(friendlyCloudError(error.message));
      return;
    }
    setCloudChecklistId("");
    localStorage.removeItem(cloudChecklistKey);
    setCloudStatus("Cloud checklist deleted. Local copy is still saved here.");
  };

  useEffect(() => {
    if (!supabase || !cloudUser || !cloudChecklistId || cloudHydrating.current) return;
    const timeout = window.setTimeout(() => {
      void saveToCloud(true);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [cloudChecklistId, cloudUser, saveToCloud, state, supabase]);

  useEffect(() => {
    if (!supabase || !cloudUser || cloudChecklistId || cloudHydrating.current) return;
    void loadFromCloud();
  }, [cloudChecklistId, cloudUser, supabase]);

  useEffect(() => {
    if (!supabase || !cloudUser) return;

    const channel = supabase
      .channel("twinkle-shared-checklist")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "packing_checklists",
          filter: `share_key=eq.${sharedChecklistKey}`,
        },
        (payload) => {
          const next = payload.new as { id?: string; state?: AppState; updated_at?: string } | null;
          if (!next?.state || !next.updated_at || next.updated_at === latestCloudUpdatedAt.current) return;

          latestCloudUpdatedAt.current = next.updated_at;
          if (next.id) {
            setCloudChecklistId(next.id);
            localStorage.setItem(cloudChecklistKey, next.id);
          }

          cloudHydrating.current = true;
          setState(next.state);
          setCloudStatus("Live update received.");
          window.setTimeout(() => {
            cloudHydrating.current = false;
          }, 1000);
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setCloudStatus("Live cloud sync active.");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [cloudUser, supabase]);

  return (
    <main className="app-shell">
      <header className={`hero ${tab !== "overview" ? "hero-compact" : ""}`}>
        <div>
          <p className="journey">India to United Kingdom</p>
          <h1>Twinkle’s UK Packing Checklist</h1>
          <p>Plan calmly, pack clearly, and keep every travel essential in one place.</p>
          <button className="save-pill" onClick={() => setTab("cloud")}>{cloudUser ? "Cloud backup on" : "Autosaved locally"}</button>
        </div>
        <div className="progress-orbit" style={{ "--pct": `${progress}%` } as CSSProperties} aria-label={`Packing Progress: ${progress}%`}>
          <span>{progress}%</span>
          <small>Packing progress</small>
        </div>
      </header>

      <nav className="top-tabs" aria-label="Main views">
        {[
          ["overview", "", "Overview"],
          ["checklist", "", "Checklist"],
          ["bags", "", "Bags"],
          ["buy", "", "Buy"],
          ["travel", "", "Travel"],
        ].map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id as Tab)}>{icon}{label}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <section className="view-grid">
          <div className="hello panel">
            <span className="section-label">Trip preparation</span>
            <h2>Hello Twinkle</h2>
            <p>Start with essentials, keep luggage organised, and check off each item as it is ready.</p>
            <button className="primary" onClick={() => setTab("checklist")}>Continue Packing</button>
          </div>
          <PackingAssistant
            items={allItems}
            categories={state.categories}
            packed={packedCount}
            remaining={remainingCount}
            essential={essentialRemaining}
            progress={progress}
            handReady={handReady}
            handTotal={handCore.length}
            onOpenChecklist={() => setTab("checklist")}
          />
          <Stats total={allItems.length} packed={packedCount} remaining={remainingCount} essential={essentialRemaining} />
          <ProgressPanel categories={state.categories} total={allItems.length} packed={packedCount} progress={progress} />
          <EssentialAlert items={essentialItems} />
          <SuggestionPanel suggestions={suggestions} dismiss={(idea) => setState((s) => ({ ...s, dismissedSuggestions: [...s.dismissedSuggestions, idea] }))} />
        </section>
      )}

      {tab === "checklist" && (
        <section className="stack">
          <div className="toolbar panel">
            <input aria-label="Search packing items" placeholder="🔍 Search packing items..." value={query} onChange={(e) => setQuery(e.target.value)} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by status">
              {["All", "Remaining", "Packed", "Essential", "Need to Buy", "Buy in UK"].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category">
              <option>All Categories</option>
              {state.categories.map((cat) => <option key={cat.id}>{cat.name}</option>)}
            </select>
            <select value={bagFilter} onChange={(e) => setBagFilter(e.target.value)} aria-label="Filter by bag">
              <option>All Bags</option>
              {bags.map((bag) => <option key={bag}>{bag}</option>)}
            </select>
          </div>

          <div className="actions-row">
            <form className="new-category" onSubmit={(e) => {
              e.preventDefault();
              if (!newCategoryName.trim()) return;
              setState((s) => ({ ...s, categories: [...s.categories, category(newCategoryName.trim(), "📦", [])] }));
              setNewCategoryName("");
            }}>
              <input placeholder="New category name" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
              <button>Add Category</button>
            </form>
            <button onClick={exportBackup}>Export Backup</button>
            <button onClick={() => importRef.current?.click()}>Import Backup</button>
            <button onClick={copyChecklist}>Share Checklist</button>
            <button onClick={() => window.print()}>Print / Save PDF</button>
            <button className="danger" onClick={resetAll}>Reset Checklist</button>
            <input ref={importRef} type="file" accept="application/json" hidden onChange={importBackup} />
          </div>

          {filteredCategories.map((cat, catIndex) => (
            <article className="category panel" key={cat.id}>
              <div className="category-head">
                <button className="collapse" onClick={() => updateCategory(cat.id, (c) => ({ ...c, collapsed: !c.collapsed }))}>{cat.collapsed ? "＋" : "−"}</button>
                <h2>{cat.icon} {cat.name}</h2>
                <span>{cat.items.filter((item) => item.status === "Packed").length}/{cat.items.length}</span>
                <button title="Move category up" disabled={catIndex === 0} onClick={() => setState((s) => {
                  const next = [...s.categories];
                  const realIndex = next.findIndex((c) => c.id === cat.id);
                  if (realIndex > 0) [next[realIndex - 1], next[realIndex]] = [next[realIndex], next[realIndex - 1]];
                  return { ...s, categories: next };
                })}>↑</button>
                <button title="Move category down" disabled={catIndex === filteredCategories.length - 1} onClick={() => setState((s) => {
                  const next = [...s.categories];
                  const realIndex = next.findIndex((c) => c.id === cat.id);
                  if (realIndex < next.length - 1) [next[realIndex + 1], next[realIndex]] = [next[realIndex], next[realIndex + 1]];
                  return { ...s, categories: next };
                })}>↓</button>
              </div>
              {cat.note && <p className="note">{cat.note}</p>}
              {renamingCategory === cat.id ? (
                <form className="inline-form" onSubmit={(e) => {
                  e.preventDefault();
                  updateCategory(cat.id, (c) => ({ ...c, name: renameValue.trim() || c.name }));
                  setRenamingCategory(null);
                }}>
                  <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                  <button>Save</button>
                </form>
              ) : (
                <div className="category-actions">
                  <button onClick={() => setNewItemCategory(cat.id)}>Add item</button>
                  <button onClick={() => { setRenamingCategory(cat.id); setRenameValue(cat.name); }}>Rename</button>
                  <button className="danger" onClick={() => confirm(`Delete ${cat.name}?`) && setState((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== cat.id) }))}>Delete</button>
                </div>
              )}
              {newItemCategory === cat.id && (
                <form className="quick-add" onSubmit={(e) => addQuickItem(e, cat.id)}>
                  <input autoFocus placeholder="Item name" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
                  <button>Add</button>
                </form>
              )}
              {!cat.collapsed && (
                <div className="item-list">
                  {cat.items.map((item, itemIndex) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      categories={state.categories}
                      onToggle={() => updateItem(cat.id, item.id, { status: item.status === "Packed" ? "Not Packed" : "Packed" })}
                      onEdit={() => setEditing({ item, categoryId: cat.id })}
                      onDelete={() => updateCategory(cat.id, (c) => ({ ...c, items: c.items.filter((x) => x.id !== item.id) }))}
                      onMoveCategory={(target) => moveItem(cat.id, item.id, target)}
                      onMoveBag={(bag) => updateItem(cat.id, item.id, { bag, status: bag === "Buy in UK" ? "Buy in UK" : item.status, source: bag === "Buy in UK" ? "Buy in UK" : item.source })}
                      onReorder={(direction) => updateCategory(cat.id, (c) => {
                        const next = [...c.items];
                        const target = itemIndex + direction;
                        if (target >= 0 && target < next.length) [next[itemIndex], next[target]] = [next[target], next[itemIndex]];
                        return { ...c, items: next };
                      })}
                    />
                  ))}
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {tab === "bags" && (
        <section className="view-grid">
          <div className="bag-grid">
            {bags.filter((bag) => bag !== "Buy in UK").map((bag) => {
              const count = allItems.filter((item) => item.bag === bag).length;
              return <button key={bag} className={`bag-card ${selectedBag === bag ? "active" : ""}`} onClick={() => setSelectedBag(bag)}><strong>{bagIcon(bag)} {bag}</strong><span>{count} Items</span></button>;
            })}
          </div>
          <WeightTracker weights={state.weights} setWeights={(weights) => setState((s) => ({ ...s, weights }))} />
          <div className="panel">
            <h2>{bagIcon(selectedBag)} {selectedBag}</h2>
            <div className="item-list">
              {allItems.filter((item) => item.bag === selectedBag).map((item) => (
                <MiniItem key={item.id} item={item} extra={item.categoryName} onBag={(bag) => {
                  const found = allItems.find((x) => x.id === item.id);
                  if (found) updateItem(found.categoryId, found.id, { bag });
                }} />
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === "buy" && (
        <section className="view-grid">
          <div className="panel">
            <h2>🛍️ Buy After Arriving in UK</h2>
            <p className="muted">Useful for heavier, bulky, or easy-to-find items.</p>
            <div className="item-list">
              {buyItems.map((item) => <MiniItem key={item.id} item={item} extra={item.categoryName} onBag={(bag) => updateItem(item.categoryId, item.id, { bag, status: bag === "Buy in UK" ? "Buy in UK" : item.status })} />)}
            </div>
          </div>
          <SuggestionPanel suggestions={suggestions} dismiss={(idea) => setState((s) => ({ ...s, dismissedSuggestions: [...s.dismissedSuggestions, idea] }))} />
        </section>
      )}

      {tab === "travel" && (
        <section className="travel-grid">
          {state.travelLists.map((list) => (
            <article className="panel travel-list" key={list.id}>
              <h2>{list.icon} {list.title}</h2>
              <p className="muted">{list.items.filter((item) => item.done).length} / {list.items.length} ready</p>
              {list.items.map((item) => (
                <label className={`travel-item ${item.done ? "done" : ""}`} key={item.id}>
                  <input type="checkbox" checked={item.done} onChange={() => setState((s) => ({ ...s, travelLists: s.travelLists.map((tl) => tl.id === list.id ? { ...tl, items: tl.items.map((x) => x.id === item.id ? { ...x, done: !x.done } : x) } : tl) }))} />
                  <span>{item.name}</span>
                </label>
              ))}
            </article>
          ))}
        </section>
      )}

      {tab === "cloud" && (
        <section className="stack">
          <CloudSyncPanel
            configured={Boolean(supabase)}
            url={cloudUrl}
            setUrl={setCloudUrl}
            anonKey={cloudKey}
            setAnonKey={setCloudKey}
            cloudUserId={cloudUser?.id ?? ""}
            status={cloudStatus}
            busy={cloudBusy}
            hasCloudChecklist={Boolean(cloudChecklistId)}
            onSaveSettings={saveCloudSettings}
            onStartSync={startCloudSync}
            onSignOut={() => supabase?.auth.signOut()}
            onSaveCloud={() => void saveToCloud(false)}
            onLoadCloud={loadFromCloud}
            onDeleteCloud={deleteCloudChecklist}
          />
        </section>
      )}

      {editing && (
        <EditSheet
          item={editing.item}
          categories={state.categories}
          currentCategoryId={editing.categoryId}
          onClose={() => setEditing(null)}
          onSave={(item, targetCategoryId) => {
            if (targetCategoryId !== editing.categoryId) moveItem(editing.categoryId, item.id, targetCategoryId, item);
            else updateItem(editing.categoryId, item.id, item);
            setEditing(null);
          }}
        />
      )}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {[
          ["overview", "O", "Overview"],
          ["checklist", "C", "Checklist"],
          ["bags", "B", "Bags"],
          ["buy", "U", "Buy"],
          ["travel", "T", "Travel"],
        ].map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id as Tab)}><span>{icon}</span>{label}</button>
        ))}
      </nav>
    </main>
  );
}

function Stats({ total, packed, remaining, essential }: { total: number; packed: number; remaining: number; essential: number }) {
  return (
    <div className="stats">
      {[
        ["Total Items", total],
        ["Packed", packed],
        ["Remaining", remaining],
        ["Essential Remaining", essential],
      ].map(([label, value]) => <div className="stat panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
  );
}

function CloudSyncPanel({
  configured,
  url,
  setUrl,
  anonKey,
  setAnonKey,
  cloudUserId,
  status,
  busy,
  hasCloudChecklist,
  onSaveSettings,
  onStartSync,
  onSignOut,
  onSaveCloud,
  onLoadCloud,
  onDeleteCloud,
}: {
  configured: boolean;
  url: string;
  setUrl: (value: string) => void;
  anonKey: string;
  setAnonKey: (value: string) => void;
  cloudUserId: string;
  status: string;
  busy: boolean;
  hasCloudChecklist: boolean;
  onSaveSettings: () => void;
  onStartSync: () => void;
  onSignOut: () => void;
  onSaveCloud: () => void;
  onLoadCloud: () => void;
  onDeleteCloud: () => void;
}) {
  return (
    <section className="panel cloud-panel">
      <div>
        <span className="section-label">Cloud sync</span>
        <h2>Save across devices</h2>
        <p className="muted">Cloud backup starts automatically. Local autosave stays on as a fallback.</p>
      </div>

      <details className="cloud-details" open={!configured}>
        <summary>{configured ? "Troubleshoot cloud settings" : "Connect Supabase Free"}</summary>
        <div className="cloud-config">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Supabase project URL" />
          <input value={anonKey} onChange={(event) => setAnonKey(event.target.value)} placeholder="Supabase anon key" />
          <button onClick={onSaveSettings}>{configured ? "Update settings" : "Connect Supabase"}</button>
        </div>
      </details>

      {configured && !cloudUserId && (
        <div className="cloud-config">
          <button disabled={busy} onClick={onStartSync}>Start cloud backup</button>
        </div>
      )}

      {configured && cloudUserId && (
        <div className="cloud-actions">
          <p className="cloud-user">Cloud sync active for this browser.</p>
          <button disabled={busy} onClick={onSaveCloud}>Backup now</button>
          <button disabled={busy} onClick={onLoadCloud}>Load cloud copy</button>
          <button disabled={busy || !hasCloudChecklist} className="danger" onClick={onDeleteCloud}>Delete cloud copy</button>
          <button disabled={busy} onClick={onSignOut}>Sign out</button>
        </div>
      )}

      <p className="cloud-status">{status}</p>
    </section>
  );
}

function ProgressPanel({ categories, total, packed, progress }: { categories: Category[]; total: number; packed: number; progress: number }) {
  return (
    <section className="panel progress-panel">
      <div className="progress-head">
        <div>
          <h2>Overall Packing</h2>
          <p>{packed} / {total} items packed</p>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="bar"><span style={{ width: `${progress}%` }} /></div>
      <div className="cat-progress-list">
        {categories.map((cat) => {
          const pct = cat.items.length ? Math.round((cat.items.filter((item) => item.status === "Packed").length / cat.items.length) * 100) : 0;
          return <div className="cat-progress" key={cat.id}><span>{cat.icon} {cat.name}</span><b>{pct}%</b><div className="bar small"><span style={{ width: `${pct}%` }} /></div></div>;
        })}
      </div>
    </section>
  );
}

function EssentialAlert({ items }: { items: (Item & { categoryName: string })[] }) {
  return (
    <section className="panel alert">
      <h2>🚨 Essential Items Still Not Packed</h2>
      {items.length ? items.slice(0, 10).map((item) => <p key={item.id}>⚠ {item.name}</p>) : <p className="all-good">✅ All essential items are packed!</p>}
    </section>
  );
}

function SuggestionPanel({ suggestions, dismiss }: { suggestions: string[]; dismiss: (idea: string) => void }) {
  return (
    <section className="panel suggestions">
      <h2>💡 Packing Suggestions</h2>
      {suggestions.length ? suggestions.map((idea) => <div key={idea} className="suggestion"><span>{idea}</span><button onClick={() => dismiss(idea)}>Dismiss</button></div>) : <p className="muted">No active suggestions right now.</p>}
    </section>
  );
}

function PackingAssistant({
  items,
  categories,
  packed,
  remaining,
  essential,
  progress,
  handReady,
  handTotal,
  onOpenChecklist,
}: {
  items: (Item & { categoryId: string; categoryName: string; categoryIcon: string })[];
  categories: Category[];
  packed: number;
  remaining: number;
  essential: number;
  progress: number;
  handReady: number;
  handTotal: number;
  onOpenChecklist: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("Ask me what is left, what is urgent, what goes in hand luggage, or what Twinkle should pack next.");
  const remainingItems = items.filter((item) => item.status !== "Packed");
  const essentialItems = remainingItems.filter((item) => item.priority === "Essential");
  const buyItems = items.filter((item) => item.status === "Need to Buy" || item.status === "Buy in UK" || item.source === "Buy in UK");
  const topCategory = categories
    .map((cat) => ({ name: cat.name, icon: cat.icon, left: cat.items.filter((item) => item.status !== "Packed").length }))
    .sort((a, b) => b.left - a.left)[0];

  const formatItems = (list: typeof remainingItems) => list.slice(0, 6).map((item) => item.name).join(", ");
  const normalizeWords = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 2);
  const findMentionedItems = (prompt: string) => {
    const words = normalizeWords(prompt);
    return items
      .map((item) => {
        const itemWords = normalizeWords(item.name);
        const exact = prompt.toLowerCase().includes(item.name.toLowerCase());
        const matches = itemWords.filter((word) => words.includes(word)).length;
        return { item, score: exact ? 10 : matches };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ item }) => item);
  };

  const askAssistant = (prompt: string) => {
    const text = prompt.trim();
    const lower = text.toLowerCase();
    if (!text) return;

    const matchedItems = findMentionedItems(text);
    if (matchedItems.length) {
      const item = matchedItems[0];
      const packedText = item.status === "Packed" ? "already packed" : item.status.toLowerCase();
      setAnswer(`${item.name} is in ${item.bag}. It is a ${item.priority.toLowerCase()} item under ${item.categoryIcon} ${item.categoryName}, quantity ${item.qty}, and it is currently ${packedText}.${item.notes ? ` Note: ${item.notes}` : ""}`);
      return;
    }

    if (lower.includes("hand") || lower.includes("passport") || lower.includes("flight")) {
      const handLeft = remainingItems.filter((item) => item.bag === "Hand Luggage");
      setAnswer(handLeft.length ? `Hand luggage is ${handReady}/${handTotal} ready. Pack these first: ${formatItems(handLeft)}.` : "Hand luggage looks ready. Keep passport, visa, ticket, and boarding pass easy to reach on travel day.");
      return;
    }

    if (lower.includes("essential") || lower.includes("urgent") || lower.includes("important")) {
      setAnswer(essentialItems.length ? `Most urgent: ${formatItems(essentialItems)}. Finish essentials before clothes or extras.` : "All essential items are packed. Nice. Next, check important documents, chargers, medicines, and luggage weight.");
      return;
    }

    if (lower.includes("buy") || lower.includes("shop")) {
      setAnswer(buyItems.length ? `Buy list: ${formatItems(buyItems)}. Keep bulky or easy-to-find items for the UK if luggage space is tight.` : "There is no active buy list right now. If something is bulky, move it to Buy in UK from the checklist.");
      return;
    }

    if (lower.includes("progress") || lower.includes("done") || lower.includes("left") || lower.includes("remaining")) {
      setAnswer(`Twinkle is ${progress}% packed: ${packed} done and ${remaining} left. The biggest open area is ${topCategory?.icon ?? ""} ${topCategory?.name ?? "the checklist"} with ${topCategory?.left ?? 0} items left.`);
      return;
    }

    if (lower.includes("next") || lower.includes("start")) {
      const next = essentialItems[0] ?? remainingItems[0];
      setAnswer(next ? `Pack next: ${next.name}. It is ${next.priority.toLowerCase()} and belongs in ${next.bag}.` : "Everything is packed. Do one final travel-day check and keep documents in hand luggage.");
      return;
    }

    setAnswer(`I checked the live checklist, but I could not find a specific item from that question. Try asking "where is passport?", "what is left in hand luggage?", "what should I buy?", or "what is urgent?". Best focus now: ${essential ? `${essential} essential items` : `${remaining} remaining items`} and ${handTotal - handReady} hand-luggage core items left.`);
  };

  return (
    <section className="panel ai-panel">
      <div className="ai-copy">
        <span className="section-label ai-label">AI packing summary</span>
        <h2>Ask Twinkle’s packing assistant</h2>
        <p>Ask about an item, bag, or what to pack next.</p>
        <div className="ai-prompts">
          {["What is urgent?", "What is left in hand luggage?", "What should I pack next?"].map((prompt) => (
            <button key={prompt} onClick={() => { setQuestion(prompt); askAssistant(prompt); }}>{prompt}</button>
          ))}
        </div>
      </div>
      <div className="ai-chat">
        <form className="ai-ask" onSubmit={(event) => { event.preventDefault(); askAssistant(question); }}>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about documents, bags, buying, or progress..." />
          <button className="primary">Ask</button>
        </form>
        <div className="ai-answer">
          <span>Answer</span>
          <p>{answer}</p>
        </div>
      </div>
      <div className="ai-summary-grid">
        <span><b>{progress}%</b><small>packed</small></span>
        <span><b>{essential}</b><small>essentials left</small></span>
        <span><b>{handReady}/{handTotal}</b><small>hand luggage</small></span>
      </div>
      <button className="ai-link" onClick={onOpenChecklist}>Open full checklist</button>
    </section>
  );
}

function ItemRow({ item, categories, onToggle, onEdit, onDelete, onMoveCategory, onMoveBag, onReorder }: {
  item: Item;
  categories: Category[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMoveCategory: (categoryId: string) => void;
  onMoveBag: (bag: Bag) => void;
  onReorder: (direction: number) => void;
}) {
  return (
    <div className={`item-row ${item.status === "Packed" ? "packed" : ""}`}>
      <button className="check" aria-label={item.status === "Packed" ? "Mark not packed" : "Mark packed"} onClick={onToggle}>{item.status === "Packed" ? "✓" : ""}</button>
      <div className="item-main">
        <strong>{item.name}</strong>
        <span><PriorityDot priority={item.priority} /> {item.priority} · Qty {item.qty} · {bagIcon(item.bag)} {item.bag} · {item.status}</span>
        {item.notes && <small>{item.notes}</small>}
      </div>
      <div className="row-actions">
        <button onClick={() => onReorder(-1)} title="Move up">↑</button>
        <button onClick={() => onReorder(1)} title="Move down">↓</button>
        <select value="" aria-label="Move to category" onChange={(e) => e.target.value && onMoveCategory(e.target.value)}>
          <option value="">Category</option>
          {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
        </select>
        <select value={item.bag} aria-label="Move to bag" onChange={(e) => onMoveBag(e.target.value as Bag)}>
          {bags.map((bag) => <option key={bag}>{bag}</option>)}
        </select>
        <button onClick={onEdit}>Edit</button>
        <button className="danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}

function EditSheet({ item, categories, currentCategoryId, onClose, onSave }: {
  item: Item;
  categories: Category[];
  currentCategoryId: string;
  onClose: () => void;
  onSave: (item: Item, categoryId: string) => void;
}) {
  const [draft, setDraft] = useState(item);
  const [categoryId, setCategoryId] = useState(currentCategoryId);
  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Edit packing item">
      <form className="sheet" onSubmit={(e) => { e.preventDefault(); onSave(draft, categoryId); }}>
        <div className="sheet-head"><h2>Edit Item</h2><button type="button" onClick={onClose}>×</button></div>
        <label>Item Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Quantity<div className="stepper"><button type="button" onClick={() => setDraft({ ...draft, qty: Math.max(1, draft.qty - 1) })}>−</button><strong>{draft.qty}</strong><button type="button" onClick={() => setDraft({ ...draft, qty: draft.qty + 1 })}>＋</button></div></label>
        <label>Priority<select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Bag Location<select value={draft.bag} onChange={(e) => setDraft({ ...draft, bag: e.target.value as Bag })}>{bags.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Status<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Where should I get this?<select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as Source })}>{sources.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Category<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>{categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label>
        <label>Notes<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Keep this easily accessible because it may be needed after landing." /></label>
        <button className="primary">Save Item</button>
      </form>
    </div>
  );
}

function WeightTracker({ weights, setWeights }: { weights: Record<string, WeightInfo>; setWeights: (weights: Record<string, WeightInfo>) => void }) {
  return (
    <section className="panel weight">
      <h2>⚖️ Luggage Weight</h2>
      {Object.entries(weights).map(([bag, info]) => {
        const pct = Math.min(120, Math.round((info.current / info.allowance) * 100));
        const over = info.current - info.allowance;
        return (
          <div className="weight-row" key={bag}>
            <h3>{bagIcon(bag as Bag)} {bag}</h3>
            <div className="weight-inputs">
              <label>Current Weight<input type="number" step="0.1" value={info.current} onChange={(e) => setWeights({ ...weights, [bag]: { ...info, current: Number(e.target.value) } })} /></label>
              <label>Airline Allowance<input type="number" step="0.1" value={info.allowance} onChange={(e) => setWeights({ ...weights, [bag]: { ...info, allowance: Number(e.target.value) || 1 } })} /></label>
            </div>
            <div className={`bar ${pct > 100 ? "over" : pct > 85 ? "warn" : ""}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <p>{over > 0 ? `⚠ Bag is ${over.toFixed(1)} kg over the baggage allowance.` : `${(info.allowance - info.current).toFixed(1)} kg remaining`}</p>
          </div>
        );
      })}
    </section>
  );
}

function MiniItem({ item, extra, onBag }: { item: Item; extra: string; onBag: (bag: Bag) => void }) {
  return <div className={`mini ${item.status === "Packed" ? "packed" : ""}`}><span>{item.name}<small>{extra} · {item.priority}</small></span><select value={item.bag} onChange={(e) => onBag(e.target.value as Bag)}>{bags.map((bag) => <option key={bag}>{bag}</option>)}</select></div>;
}

function PriorityDot({ priority }: { priority: Priority }) {
  return <i className={`dot ${priority.toLowerCase()}`} aria-hidden="true" />;
}

function bagIcon(bag: Bag) {
  if (bag === "Hand Luggage") return "🎒";
  if (bag === "Personal Bag") return "👝";
  if (bag === "Buy in UK") return "📦";
  return "🧳";
}
