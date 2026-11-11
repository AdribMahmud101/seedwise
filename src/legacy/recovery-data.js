export const references = [
  [
    "rr-dry",
    "BAMIS · drought adaptation",
    "https://www.bamis.gov.bd/page/risk-map-recommendation/",
    "Moisture conservation, water storage and crop diversification.",
  ],
  [
    "rr-mustard",
    "DAE · Rangpur, 7 October 2020",
    "https://www.bamis.gov.bd/res/bulletins/2020/10/08/22190.pdf#page=5",
    "Archived mustard sowing guidance: middle October to middle November.",
  ],
  [
    "rr-late",
    "DAE · 19 August 2020",
    "https://www.bamis.gov.bd/res/public/bulletins/2020/08/21/20402.pdf#page=4",
    "Archived post-flood Aman windows. Requires variety-specific seedlings; not a current bulletin.",
  ],
  [
    "rr-aman",
    "BRRI · BRRI dhan71",
    "https://riceprofile.brri.gov.bd/varieties/80",
    "25 July–9 August transplanting, 20–25-day seedlings, 115-day total life.",
  ],
  [
    "rr-green",
    "BAMIS · green gram",
    "https://www.bamis.gov.bd/en/crops/view/57/",
    "Temperature, drainage and water requirements.",
  ],
  [
    "rr-fire",
    "Bangladesh Fire Service",
    "https://fireservice.gov.bd/",
    "Official emergency information and hotline 102.",
  ],
  [
    "rr-flood",
    "IFRC · flood safety",
    "https://ifrcstaysafe.org/disasters-tips/floods",
    "Safe access, electrical and contamination hazards.",
  ],
  [
    "rr-soil",
    "UC ANR · post-fire soil",
    "https://www.ucanr.edu/program/uc-anr-fire-network/home-garden-soil-safety",
    "Assess contamination sources and test with qualified support before food growing. California guidance; local review needed.",
  ],
  [
    "rr-regrow",
    "USDA NRCS · after-fire seeding",
    "https://www.nrcs.usda.gov/resources/guides-and-instructions/after-the-fire-seeding",
    "Natural regrowth assessment before seeding; US guidance transferred only as a general principle.",
  ],
  [
    "rr-ash",
    "CDPH · wildfire ash",
    "https://www.cdph.ca.gov/Programs/EPO/Pages/Wildfire%20Pages/ash-homegardens.aspx",
    "Mixed fire ash may contain contaminants. Do not use as garden fertilizer.",
  ],
  [
    "bd-999",
    "National Emergency Service 999",
    "https://www.police.gov.bd/",
    "Unified police, fire and ambulance helpline run by Bangladesh Police.",
  ],
  [
    "bd-krishi",
    "Krishi Call Center 16123",
    "https://sharifpurup.noakhali.gov.bd/en/site/page/b1uV-%E0%A6%95%E0%A7%83%E0%A6%B7%E0%A6%BF-%E0%A6%95%E0%A6%B2-%E0%A6%B8%E0%A7%87%E0%A6%A8%E0%A7%8D%E0%A6%9F%E0%A6%BE%E0%A6%B0",
    "Agriculture Information Service helpline for crop, fisheries and livestock advice.",
  ],
].map(([id, name, url, method]) => ({
  id,
  name,
  publisher: name,
  url,
  method,
}));

export const phases = [
  ["prepare", "Prepare before a disaster", "দুর্যোগের আগে প্রস্তুতি"],
  ["active", "The hazard is still active", "দুর্যোগ এখনও চলছে"],
  ["inspect", "It has passed · inspect first", "দুর্যোগ শেষে · আগে যাচাই"],
  [
    "ready",
    "Safe access confirmed · plan recovery",
    "নিরাপদ প্রবেশ নিশ্চিত · পরিকল্পনা",
  ],
];
export const reasons = {
  dates: [
    "Enter a valid assessment date, 0–180 whole delay days, and a next-crop date after the assessment.",
    "সঠিক তারিখ, ০–১৮০ পূর্ণ দিন দেরি এবং পরের ফসলের তারিখ দিন।",
  ],
  prepare: [
    "Use the preparation steps now. Reassess actual field conditions after any event.",
    "এখন প্রস্তুতির কাজ করুন। দুর্যোগ হলে পরে জমি আবার দেখুন।",
  ],
  active: [
    "Keep people safe first. Planting dates open after the event and safe access are confirmed.",
    "আগে মানুষের নিরাপত্তা। দুর্যোগ থামলে ও প্রবেশ নিরাপদ হলে বপনের সময় দেখা যাবে।",
  ],
  inspect: [
    "Confirm safe access with local authorities, then complete the field checks.",
    "স্থানীয় কর্তৃপক্ষের কাছে নিরাপদ প্রবেশ নিশ্চিত করে জমি যাচাই করুন।",
  ],
  dry: [
    "The seedbed is too dry. Secure enough moisture for establishment before sowing.",
    "বীজতলা বেশি শুকনো। বীজ গজানোর জন্য পর্যাপ্ত আর্দ্রতা নিশ্চিত করুন।",
  ],
  wet: [
    "Water remains or the ground is unstable. Wait for suitable, safely workable conditions.",
    "পানি আছে বা মাটি স্থির নয়। নিরাপদে কাজ করার উপযুক্ত হওয়া পর্যন্ত অপেক্ষা করুন।",
  ],
  ground: [
    "Check that the ground is stable, workable and moist enough for establishment.",
    "মাটি স্থির, কাজের উপযোগী এবং বীজ গজানোর মতো আর্দ্র কি না দেখুন।",
  ],
  burn: [
    "Review burned buildings, fuel, chemicals and ash with qualified local support. Hold food-crop planting while contamination is unresolved.",
    "পোড়া ঘর, জ্বালানি, রাসায়নিক ও ছাই বিশেষজ্ঞকে দেখান। দূষণের বিষয় অমীমাংসিত থাকলে খাদ্যফসল লাগাবেন না।",
  ],
  contamination: [
    "Check floodwater contamination and debris locally before deciding on food production.",
    "খাদ্যফসলের আগে বন্যার পানির দূষণ ও আবর্জনা স্থানীয়ভাবে যাচাই করুন।",
  ],
  protect: [
    "Assess the surviving crop with an extension officer before replacing it.",
    "ফসল তুলে ফেলার আগে কৃষি কর্মকর্তার সঙ্গে বেঁচে থাকা ফসল দেখুন।",
  ],
  stand: [
    "Confirm that this area is available for a new crop.",
    "নতুন ফসলের জন্য জমি খালি আছে কি না নিশ্চিত করুন।",
  ],
  water: [
    "Confirm water for establishment and the crop’s critical growth stages. Drought tolerance still needs water.",
    "বীজ গজানো ও গুরুত্বপূর্ণ বৃদ্ধির সময়ে পানির ব্যবস্থা নিশ্চিত করুন। খরা সহনশীল ফসলেও পানি লাগে।",
  ],
};
export const contacts = [
  {
    num: "999",
    name: ["National emergency", "জাতীয় জরুরি সেবা"],
    source: "bd-999",
    hazards: ["flood"],
  },
  {
    num: "102",
    name: ["Fire Service", "ফায়ার সার্ভিস"],
    source: "rr-fire",
    hazards: ["fire"],
  },
  {
    num: "16123",
    name: ["Krishi Call Center", "কৃষি কল সেন্টার"],
    source: "bd-krishi",
    hazards: ["drought"],
  },
];
export const statuses = {
  open: ["Window open", "বপনের সময় চলছে"],
  upcoming: ["Next window", "পরের সুযোগ"],
  later: ["Later season", "পরের মৌসুম"],
  deadline: ["Conflicts with next crop", "পরের ফসলের সঙ্গে সংঘাত"],
  duration: ["Confirm harvest timing", "কাটার সময় নিশ্চিত করুন"],
  land: ["Check land class", "জমির শ্রেণি মিলিয়ে নিন"],
  seedlings: ["Confirm suitable seedlings", "উপযুক্ত চারা নিশ্চিত করুন"],
};
export const crops = [
  {
    id: "mustard",
    plant: "mustard",
    name: ["Short-duration mustard", "স্বল্পমেয়াদি সরিষা"],
    variety: "BARI Shorisha-14",
    start: "10-15",
    end: "11-15",
    days: [75, 80],
    verb: ["Sow", "বপন"],
    why: [
      "A short winter crop can fit a drained field before the next season.",
      "পানি নেমে যাওয়া জমিতে পরের মৌসুমের আগে স্বল্পমেয়াদি শীতের ফসল।",
    ],
    check: [
      "Keep moisture for germination, flowering and pod development. Check soil, pests and market locally.",
      "অঙ্কুরোদ্গম, ফুল ও ফলের সময়ে আর্দ্রতা রাখুন। মাটি, পোকা ও বাজার স্থানীয়ভাবে যাচাই করুন।",
    ],
    basis: [
      "Rangpur guidance says mid-October to mid-November; 15 October–15 November are approximate demo bounds. Variety duration comes from published local trials.",
      "রংপুরের নির্দেশনায় মধ্য অক্টোবর–মধ্য নভেম্বর। ডেমোতে ১৫ অক্টোবর–১৫ নভেম্বর আনুমানিক সীমা। জাতের মেয়াদ স্থানীয় গবেষণা থেকে।",
    ],
    sources: ["rr-mustard", "hossain2022"],
  },
  {
    id: "mung",
    plant: "mungbean",
    name: ["Mungbean", "মুগ ডাল"],
    variety: "BARI Mung-6",
    start: "02-21",
    end: "03-15",
    days: [55, 58],
    verb: ["Sow", "বপন"],
    why: [
      "A short pulse option for a well-drained spring field. Legumes can support a more varied rotation.",
      "বসন্তে পানি না জমা জমির জন্য স্বল্পমেয়াদি ডাল। ফসলচক্রে বৈচিত্র্য আনে।",
    ],
    check: [
      "Avoid waterlogging. Confirm warm conditions, seed and water for establishment. Nitrogen benefit depends on nodulation and residue management.",
      "জলাবদ্ধতা এড়ান। উষ্ণ আবহাওয়া, বীজ ও প্রয়োজনীয় পানি নিশ্চিত করুন। নাইট্রোজেনের লাভ শিকড়ের গুটি ও অবশিষ্টাংশ ব্যবস্থাপনার ওপর নির্ভর করে।",
    ],
    basis: [
      "Late-February to mid-March Kharif-I guidance. A Gangachara trial sowed on 21 February. The 55–58-day duration is a variety reference, not a promised harvest.",
      "খরিফ-১ এ ফেব্রুয়ারির শেষ–মার্চের মাঝামাঝি। গঙ্গাচড়ার গবেষণায় ২১ ফেব্রুয়ারি বপন হয়। ৫৫–৫৮ দিন জাতের নির্দেশক মেয়াদ, নিশ্চয়তা নয়।",
    ],
    sources: ["ais-mung", "islam2014", "rr-green"],
  },
  {
    id: "aman71",
    plant: "rice",
    name: ["Drought-tolerant Aman", "খরা সহনশীল আমন"],
    variety: "BRRI dhan71",
    start: "07-25",
    end: "08-09",
    days: [90, 95],
    stock: "short",
    land: "high",
    verb: ["Transplant", "রোপণ"],
    why: [
      "A monsoon rice option for high or medium-high land with supplemental water available.",
      "উঁচু বা মাঝারি উঁচু জমিতে সম্পূরক সেচের ব্যবস্থাসহ বর্ষার ধান।",
    ],
    check: [
      "Use healthy 20–25-day seedlings. Nursery sowing is 5–14 July. Supplemental irrigation may still be needed.",
      "২০–২৫ দিনের সুস্থ চারা নিন। বীজতলায় বপন ৫–১৪ জুলাই। প্রয়োজনমতো সম্পূরক সেচ দিতে হবে।",
    ],
    basis: [
      "BRRI transplant window and 115-day total life. The 90–95 days shown after transplanting subtract 20–25 nursery days; actual maturity varies.",
      "ব্রির রোপণকাল ও মোট জীবনকাল ১১৫ দিন। বীজতলার ২০–২৫ দিন বাদ দিয়ে রোপণের পর ৯০–৯৫ দিন দেখানো হয়েছে। প্রকৃত সময় বদলাতে পারে।",
    ],
    sources: ["rr-aman"],
  },
  {
    id: "flood-short",
    plant: "rice",
    hazards: ["flood"],
    name: ["Late short-duration Aman", "দেরিতে স্বল্পমেয়াদি আমন"],
    variety: "BRRI dhan71 · local review",
    start: "08-10",
    end: "08-25",
    days: null,
    stock: "short",
    land: "high",
    verb: ["Transplant", "রোপণ"],
    why: [
      "An archived flood-recovery option after the regular BRRI dhan71 window.",
      "নিয়মিত সময় পেরিয়ে গেলে বন্যা-পরবর্তী পুরনো নির্দেশনার একটি সুযোগ।",
    ],
    check: [
      "DAE listed selected short varieties through 25 August after water recedes. Confirm variety, seedling age and current advice locally.",
      "পানি নামলে কিছু স্বল্পমেয়াদি জাত ২৫ আগস্ট পর্যন্ত রোপণের নির্দেশনা ছিল। জাত, চারার বয়স ও বর্তমান নির্দেশনা যাচাই করুন।",
    ],
    basis: [
      "The 2020 DAE bulletin is historical guidance. 10 August starts this demo’s late window after the regular window. No reliable field duration is assigned.",
      "২০২০ সালের ঐতিহাসিক নির্দেশনা। নিয়মিত সময়ের পরে ডেমোতে ১০ আগস্ট থেকে দেখানো। কাটার নির্ভরযোগ্য মেয়াদ দেওয়া হয়নি।",
    ],
    sources: ["rr-late", "rr-aman"],
  },
  {
    id: "flood-late",
    plant: "rice",
    hazards: ["flood"],
    name: ["Late flood-season Aman", "বন্যার পর দেরিতে আমন"],
    variety: "BR22 / BR23 / BRRI dhan46 · review",
    start: "08-26",
    end: "09-15",
    days: null,
    stock: "sensitive",
    verb: ["Transplant", "রোপণ"],
    why: [
      "A time-sensitive option only if suitable photoperiod-sensitive seedlings already exist.",
      "আলোকসংবেদনশীল উপযুক্ত চারা আগে থেকেই থাকলে সীমিত সময়ের সুযোগ।",
    ],
    check: [
      "The nursery must have been sown by 15 August under the archived guidance. September transplanting does not mean starting a new nursery in September.",
      "পুরনো নির্দেশনা অনুযায়ী ১৫ আগস্টের মধ্যে বীজতলা বপন থাকতে হবে। সেপ্টেম্বরে রোপণ মানে সেপ্টেম্বরে নতুন বীজতলা করা নয়।",
    ],
    basis: [
      "2020 DAE: selected photoperiod-sensitive varieties through 15 September. 26 August separates this demo from the short-variety window. Confirm land fit and maturity locally.",
      "২০২০ সালে ডিএই: কিছু আলোকসংবেদনশীল জাত ১৫ সেপ্টেম্বর পর্যন্ত। ডেমোতে ২৬ আগস্ট থেকে আলাদা দেখানো। জমির উপযোগিতা ও কাটার সময় স্থানীয়ভাবে নিশ্চিত করুন।",
    ],
    sources: ["rr-late"],
  },
];
export const guides = {
  flood: {
    name: ["Flood", "বন্যা"],
    icon: "water",
    caption: [
      "Wait for water to recede. Rebuild around the season.",
      "পানি নামলে মৌসুম মিলিয়ে আবার শুরু।",
    ],
    actions: [
      [
        "Move seed, records and equipment to a safe raised store before flooding. Plan a safe route and raised nursery with local support.",
        "বন্যার আগে বীজ, রেকর্ড ও যন্ত্র নিরাপদ উঁচু স্থানে রাখুন। নিরাপদ পথ ও উঁচু বীজতলার পরিকল্পনা করুন।",
      ],
      [
        "Follow local evacuation advice. Stay out of floodwater and away from electrical hazards. Do not enter a field to save crops.",
        "স্থানীয় সরিয়ে নেওয়ার নির্দেশনা মানুন। বন্যার পানি ও বিদ্যুতের ঝুঁকি থেকে দূরে থাকুন। ফসল বাঁচাতে পানিতে নামবেন না।",
      ],
      [
        "After safe access is confirmed, record flood duration, silt, erosion, debris and surviving plants. Review contamination and repair drainage safely.",
        "নিরাপদ প্রবেশ নিশ্চিত হলে পানির স্থায়িত্ব, পলি, ভাঙন, আবর্জনা ও বেঁচে থাকা গাছ লিখুন। দূষণ দেখুন ও নিরাপদে নিষ্কাশন ঠিক করুন।",
      ],
      [
        "Keep recovering plants where viable. For an available plot, match the date, drainage, water and seedlings to the planting windows below.",
        "বাঁচানো সম্ভব এমন গাছ রাখুন। খালি জমিতে তারিখ, পানি নামা, সেচ ও চারা মিলিয়ে নিচের সময় দেখুন।",
      ],
    ],
    improve: [
      "Keep drainage routes open, raise nurseries where appropriate, record flood depth and avoid blocking channels with trees.",
      "পানি যাওয়ার পথ খোলা রাখুন, উপযুক্ত জায়গায় উঁচু বীজতলা করুন, পানির গভীরতা লিখুন। গাছ দিয়ে খাল বন্ধ করবেন না।",
    ],
    sources: ["rr-flood", "rr-late"],
  },
  drought: {
    name: ["Drought", "খরা"],
    icon: "sun",
    caption: [
      "Protect moisture. Choose a crop the water can support.",
      "আর্দ্রতা ধরে রাখুন। পানির সামর্থ্য মিলিয়ে ফসল।",
    ],
    actions: [
      [
        "Plan water storage, repair irrigation leaks and compare seasonal demand. Keep clean soil cover where suitable and safe.",
        "পানি ধরে রাখা, সেচের লিক মেরামত ও মৌসুমি চাহিদা তুলনা করুন। উপযুক্ত নিরাপদ স্থানে পরিষ্কার আচ্ছাদন রাখুন।",
      ],
      [
        "Check root-zone moisture and the crop’s growth stage. Ask an extension officer how to allocate limited water. Delay new sowing on a dry seedbed.",
        "শিকড়ের আর্দ্রতা ও ফসলের বয়স দেখুন। সীমিত পানি কোন ফসলে দেবেন কৃষি কর্মকর্তার সঙ্গে ঠিক করুন। শুকনো বীজতলায় নতুন বপন পিছিয়ে দিন।",
      ],
      [
        "Inspect surviving crops after rain or irrigation. Check whether moisture persists below the surface and whether the water supply covers critical stages.",
        "বৃষ্টি বা সেচের পর ফসল দেখুন। মাটির নিচে আর্দ্রতা আছে কি না এবং গুরুত্বপূর্ণ সময়ে পানি পাওয়া যাবে কি না যাচাই করুন।",
      ],
      [
        "Choose only within the season and available water. Mungbean, mustard and drought-tolerant Aman have different windows and requirements.",
        "মৌসুম ও পানির ব্যবস্থা মিলিয়ে বেছে নিন। মুগ, সরিষা ও খরা সহনশীল আমনের সময় ও চাহিদা আলাদা।",
      ],
    ],
    improve: [
      "Retain suitable clean crop residues, limit unnecessary tillage, diversify rotations and compare pumped water demand before expanding planting.",
      "উপযুক্ত পরিষ্কার ফসলের অবশিষ্টাংশ রাখুন, অপ্রয়োজনীয় চাষ কমান, ফসলচক্রে বৈচিত্র্য আনুন এবং আবাদ বাড়ানোর আগে সেচের চাহিদা তুলনা করুন।",
    ],
    sources: ["rr-dry", "rr-green", "rr-aman"],
  },
  fire: {
    name: ["Fire", "আগুন"],
    icon: "flame",
    caption: [
      "Return safely. Check soil, then help the land recover.",
      "নিরাপদে ফিরুন। মাটি যাচাই করে পুনরুদ্ধার।",
    ],
    actions: [
      [
        "Plan an evacuation route and keep fuel and chemical stores secure. Ask local fire and forestry services about suitable separation around buildings.",
        "নিরাপদ বের হওয়ার পথ রাখুন, জ্বালানি ও রাসায়নিক নিরাপদে রাখুন। ঘরের পাশে নিরাপদ ফাঁকা স্থান নিয়ে দমকল ও বন বিভাগের পরামর্শ নিন।",
      ],
      [
        "Leave the danger area and follow emergency instructions. Call Bangladesh Fire Service 102 for a fire emergency. Do not re-enter for tools or crops.",
        "বিপদ থেকে সরে জরুরি নির্দেশনা মানুন। আগুনের জরুরি সেবায় বাংলাদেশ ফায়ার সার্ভিস ১০২। যন্ত্র বা ফসলের জন্য ফিরে যাবেন না।",
      ],
      [
        "Wait for official re-entry clearance. Record burned structures, fuels, ash, erosion and surviving plants. Arrange qualified soil assessment where contamination is possible.",
        "ফিরে যাওয়ার অনুমতি না পাওয়া পর্যন্ত অপেক্ষা করুন। পোড়া ঘর, জ্বালানি, ছাই, ক্ষয় ও বেঁচে থাকা গাছ লিখুন। দূষণের আশঙ্কা থাকলে বিশেষজ্ঞ দিয়ে মাটি যাচাই করুন।",
      ],
      [
        "Resolve soil and water safety first. Protect surviving vegetation and avoid unnecessary disturbance. Food-crop choices depend on clearance and the normal crop calendar.",
        "আগে মাটি ও পানির নিরাপত্তা নিশ্চিত করুন। বেঁচে থাকা গাছ রাখুন, অপ্রয়োজনীয় মাটি নাড়বেন না। খাদ্যফসলের জন্য ছাড়পত্র ও স্বাভাবিক মৌসুম মিলতে হবে।",
      ],
    ],
    improve: [
      "Do not spread mixed fire ash as fertilizer. Agree erosion control and regrowth monitoring with local support before choosing any replacement trees.",
      "মিশ্র পোড়া ছাই সার হিসেবে ছড়াবেন না। গাছ বাছাইয়ের আগে স্থানীয় বিশেষজ্ঞের সঙ্গে মাটিক্ষয় নিয়ন্ত্রণ ও পুনরুজ্জীবন পর্যবেক্ষণ ঠিক করুন।",
    ],
    sources: ["rr-fire", "rr-soil", "rr-regrow", "rr-ash"],
  },
};
export const examples = {
  flood: {
    date: "2026-09-02",
    phase: "ready",
    ground: "workable",
    standing: "free",
    water: "dependable",
    exposure: "clear",
    seedlings: "sensitive",
    land: "high",
    edge: "wet",
    nextDate: "",
  },
  drought: {
    date: "2026-02-25",
    phase: "ready",
    ground: "workable",
    standing: "free",
    water: "limited",
    exposure: "clear",
    seedlings: "unknown",
    land: "high",
    nextDate: "2026-05-05",
    edge: "dry",
  },
  fire: {
    date: "2026-11-04",
    phase: "ready",
    ground: "workable",
    standing: "free",
    water: "limited",
    exposure: "suspected",
    seedlings: "unknown",
    land: "high",
    nextDate: "2027-02-15",
    edge: "none",
  },
};
