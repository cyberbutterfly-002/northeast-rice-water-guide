const PROVINCE_ORDER = ["黑龙江省", "吉林省", "辽宁省"];
const AUDIENCE_NOTE = {
  farm: "面向水稻种植户，语言简洁",
  org: "面向项目与培训，补充更多文献资料",
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0];
  return rows.slice(1).filter((cells) => cells.some((cell) => cell !== "")).map((cells) => {
    const record = {};
    header.forEach((name, index) => {
      record[name] = cells[index] == null ? "" : cells[index];
    });
    return record;
  });
}

function formatTemp(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatClimateFoot(row, audience) {
  const station = `气候数据来自${row.station_name_zh}气象站`;
  if (audience !== "org") return station;
  const distance = Math.round(Number(row.distance_km));
  return [
    `${station}（约 ${distance} km）`,
    "多年平均按气候标准期为 1991–2020",
    "冷害判断标准：QX/T 101—2009",
    "热害判断标准：GB/T 37744—2019",
  ].join("\n");
}

function gradeList(groups, noun) {
  return (groups || []).map((group) => `有 ${group.n} 年出现${group.grade}${noun}`).join("，");
}

function formatTrendTemp(value) {
  return Math.abs(Number(value)).toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

function coldSignal(grade) {
  if (!grade || grade === "未达") return "";
  return `达到${grade}延迟型冷害的气候信号`;
}

function anomalyDirection(value) {
  const number = Number(value);
  if (number > 0) return "高";
  if (number < 0) return "低";
  return "";
}

function formatAnomalyLine(row, useSum) {
  const known = [
    ["2023", row.t59_anom_2023, row.delay_cold_2023],
    ["2024", row.t59_anom_2024, row.delay_cold_2024],
    ["2025", row.t59_anom_2025, row.delay_cold_2025],
  ].filter(([, value]) => value !== "");
  let text = "";
  if (known.length) {
    const directions = known.map(([, value]) => anomalyDirection(value));
    const grades = known.map(([, , grade]) => grade || "未达");
    const sameDirection = directions.every((direction) => direction === directions[0]);
    const sameGrade = grades.every((grade) => grade === grades[0]);
    const names = known.map(([year]) => `${year}年`).join("、");
    const signal = sameGrade ? coldSignal(grades[0]) : "";
    if (known.length >= 2 && sameDirection && sameGrade && directions[0]) {
      const numbers = known.map(([, value]) => `${formatTemp(Math.abs(Number(value)))}℃`).join("、");
      const subject = useSum ? "5–9月的月平均气温之和" : "5–9月的月平均气温";
      text = `${names}${subject}，比这${row.n_years}年分别${directions[0]} ${numbers}${signal ? `，${signal}` : ""}。`;
    } else if (known.length >= 2 && sameGrade && directions.every(Boolean)) {
      const numbers = known.map(([, value]) => `${anomalyDirection(value)} ${formatTemp(Math.abs(Number(value)))}℃`).join("、");
      const subject = useSum ? "5–9月的月平均气温之和" : "5–9月的月平均气温";
      text = `${names}${subject}，比这${row.n_years}年分别${numbers}${signal ? `，均${signal}` : ""}。`;
    } else {
      text = `${known.map(([year, value, grade]) => {
        const direction = anomalyDirection(value);
        const amount = direction
          ? `比这${row.n_years}年${direction} ${formatTemp(Math.abs(Number(value)))}℃`
          : `与这${row.n_years}年相同`;
        const yearSignal = coldSignal(grade);
        const subject = useSum ? "5–9月的月平均气温之和" : "5–9月的月平均气温";
        return `${year}年${subject}${amount}${yearSignal ? `，${yearSignal}` : ""}`;
      }).join("；")}。`;
    }
  }
  return text;
}

function formatColdLine(row, audience, grades) {
  const record = grades || { july: [], aug: [] };
  const span = `${row.trend_start}–${row.trend_end}`;
  const july = gradeList(record.july, "冷害");
  const august = gradeList(record.aug, "冷害");
  if (audience !== "org") {
    const julyPart = july ? `7月${july}` : "7月没有出现冷害";
    const augustPart = august ? `8月上旬，${august}` : "8月上旬没有出现冷害";
    return `${span}年里，${julyPart}；${augustPart}。`;
  }
  const julyPart = july ? `7月${july}` : "7月没有出现冷害";
  const augustPart = august ? `8月上旬在抽穗开花时，${august}` : "8月上旬在抽穗开花时没有出现冷害";
  return `${span}年，${julyPart}；${augustPart}。未填抽穗日时，障碍型冷害根据7月孕穗，8月上旬抽穗开花统一计算。持续 2 天为轻度，3～4 天为中度，5 天及以上为重度。这种低温会使空壳明显增加。`;
}

function formatHeatSentence(heat, audience) {
  if (!heat) return "";
  const flower = gradeList(heat.flower, "热害");
  const sentence = flower ? `孕穗开花期${flower}。` : "孕穗开花期没有出现热害。";
  if (audience !== "org") return sentence;
  return `${sentence}热害按7月1日至8月20日孕穗开花计算。日最高气温达到 35℃ 并连续 3 天及以上，计入危害积温。不超过 15℃·d 为轻度，超过 15℃·d 至 30℃·d 为中度，超过 30℃·d 为重度。这种高温会使空壳增加、粒重下降。`;
}

function formatClimateLines(row, audience, grades, heat) {
  const mean = formatTemp(Number(row.gs_tmean_c));
  let season = audience === "org"
    ? `多年5–9月平均气温 ${mean}℃`
    : `${row.normal_start}–${row.normal_end}年5–9月平均 ${mean}℃`;
  if (row.gs_prcp_mm !== "") {
    season += `、降水 ${Math.round(Number(row.gs_prcp_mm))} mm`;
  }
  season += "。";
  const trendParts = [];
  if (row.tmean_trend_c_per_10y !== "") {
    const trend = Number(row.tmean_trend_c_per_10y);
    const direction = trend > 0 ? "升高" : trend < 0 ? "降低" : "变化";
    trendParts.push(`气温约每10年${direction} ${formatTrendTemp(trend)}℃`);
  }
  if (row.prcp_trend_mm_per_10y !== "") {
    const trend = Number(row.prcp_trend_mm_per_10y);
    const direction = trend > 0 ? "增加" : trend < 0 ? "减少" : "变化";
    trendParts.push(`降水约每10年${direction} ${Math.round(Math.abs(trend))} mm`);
  }
  if (trendParts.length) season += `${trendParts.join("，")}。`;

  const cold = formatColdLine(row, audience, grades);
  const heatLine = formatHeatSentence(heat, audience);
  if (audience === "org") {
    return [season, formatAnomalyLine(row, true), cold, heatLine].filter((text) => text);
  }
  return [season, formatAnomalyLine(row, false), `${cold}${heatLine}`].filter((text) => text);
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function fillSelect(select, values) {
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.hidden = true;
  blank.selected = true;
  blank.textContent = "请选择";
  select.append(blank);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  select.value = "";
}

const REQUIRED_FIELDS = ["area", "drain", "water", "ridge", "field_even", "straw_return"];

function groupChosen(form, name) {
  const nodes = form.elements[name];
  if (!nodes) return false;
  const list = nodes.length === undefined ? [nodes] : [...nodes];
  return list.some((node) => node.checked);
}

const STAGES = [
  ["整地", "icons/01-land.png"],
  ["移栽", "icons/02-transplant.png"],
  ["返青", "icons/03-regreen.png"],
  ["分蘖前中期", "icons/04-tiller-early.png"],
  ["分蘖后期", "icons/05-tiller-late.png"],
  ["孕穗开花", "icons/06-boot.png"],
  ["灌浆", "icons/07-fill.png"],
  ["收获前", "icons/08-harvest.png"],
];

const ORG_CASES = {
  furrow: [
    "东北寒地两年垄作对照中，相对常规栽培，甲烷排放 2023 年降低 50.8%，2024 年降低 71.0%，产量两年均无显著损失。数字对应这两年、这一对照。",
    "写明移栽过程的试验里，移栽前起垄、返青后沟灌，相对移栽后平作淹水，全季降幅约 21% 至 70%，中间多见 30% 至 50%。当地应用时采用当地示范结果。",
    "南宁一项垄宽约 80 厘米的试验中，氮肥与淹水对照相同、只改灌溉时，降幅约 20.9%；再叠加返青期减氮，降幅约 48.9%。20.9% 对应只改灌溉，48.9% 对应灌溉加重加氮肥调整。",
    "重庆一项垄作直播试验中，水面低于垄面约 15 厘米时甲烷降幅更大，增产优势减弱。日常沟水保持低于垄面 5 到 10 厘米。",
    "直播或条播的同田比较中，沟灌甲烷可以低于落干更深的干湿交替。移栽田已有的对照是沟灌相对平作淹水。两种做法的降幅各自引用。",
  ],
  awd: [
    "《稻田甲烷减排灌溉技术规范》（NY/T 4718—2025）规定平作田按水位上下限灌排。",
    "平整度不超过 4.0 厘米，指旋耕后沿垂直作业方向测得的平均偏差。田埂高度宜不低于 15 厘米。",
    "相对农户常规灌溉，附录 A 的效果目标为：泡田不低于 30%，秧苗期不低于 20%，分蘖前中期不低于 30%，孕穗开花不低于 30%，灌浆结实为 0 至 5%，全过程不低于 20%。分蘖后期在表中未列百分数。这些百分数是该规范提出的目标，试验背景在规范起草地。东北稻田的减排率用当地对照。",
  ],
  sun: [
    "相对从不落干的长期淹水，一次中期排水的产量变化不显著，甲烷下降，氧化亚氮上升，综合增温潜势仍下降。晒得越重，甲烷降得越多；产量未随晒田轻重显著变化。",
    "东北田间试验里，常规对照通常已经含一次搁田。轻干湿交替产量高于浅水，也高于重干湿交替。建三江的浅湿和干湿交替产量高于含搁田的常规水层。产量更高的处理，是晒田之后继续浅湿或轻度干湿。",
    "东北田管意见把这次落干写成控无效分蘖、根系下扎、减轻后期倒伏。落干后株间湿度下降。稻瘟病和二化螟仍按叶龄、破口和诱控日历管理。",
    "这些结论的条件是按茎数开晒，并在幼穗分化前复水。孕穗缺水会增加空瘪粒。",
  ],
};

const STRAW_CASE = "庆安试验里，淹灌加秸秆 6 t/hm² 时甲烷大约加倍；改成控制灌溉或间歇灌溉后，这一增排可以压到低于「淹灌、不还田」。还田几乎不减少灌溉定额。各期水位仍按上面的做法。本地预期用当地对照。";

const PATH_TEXT = {
  furrow: {
    name: "起垄沟灌",
    summary: "整地前做成垄和沟，灌溉水留在沟里，垄面不长期积水。",
    stages: [
      "移栽前做成垄和沟。垄宽约 80 厘米，沟宽约 20 厘米，沟深约 15 厘米，可按当地机具调整。垄面不长期积水，沟内可蓄水。",
      "短时间浅水护苗，约 1 到 3 厘米，或沟水短时间略漫垄面。护苗结束后回到沟灌水位。",
      "改为沟灌。水留在沟中，水面宜低于垄面 5 到 10 厘米，水不上垄面。",
      "沟水保持低于垄面 5 到 10 厘米。垄面薄水或湿润，约在田面下 5 厘米到田面上 3 厘米。这一水位维持到抽穗。",
      "搁田，约在田面下 20 到 10 厘米。沟内保留底墒。分蘖末期的临时开沟并入这一期。",
      "平时沟水低于垄面、垄面不淹。遇低温先加深水层，再回到沟灌。",
      "沟水仍低于垄面 5 到 10 厘米，垄面不长期积水。",
      "落干，收获前 5 到 10 天断水。",
    ],
  },
  awd: {
    name: "干湿交替",
    summary: "平作，不挖沟。水落到下限就灌，升到上限就停，高出上限就排。",
    stages: [
      "平作，不挖沟。",
      "高出田面 1 至 3 厘米。水落到下限就灌，升到上限就停，高出上限就排。",
      "田面下 5 厘米到与田面齐平。",
      "田面下 5 厘米到田面上 3 厘米。",
      "搁田，田面下 20 至 10 厘米。",
      "田面下 3 厘米到田面上 3 厘米。",
      "田面下 10 厘米到田面上 3 厘米。",
      "沙性田提前 5 至 7 天排水；排水不畅或土质黏重的田提前 7 至 10 天。",
    ],
  },
  sun: {
    name: "晒田",
    summary: "茎数到计划茎数约 80% 时排水一次，晒到鸡爪裂或见白根，幼穗分化前复水，其后孕穗留浅水。",
    stages: [
      "平作。插秧前保持能插秧的浅水，这一阶段不安排晒田。",
      "插秧时浅水护苗。移栽后先保成活，这一阶段不排水晒田。",
      "返青期留浅水，水层大约到苗高的三分之一，先让秧苗扎根。",
      "保持浅水，大约 3 到 5 厘米，让分蘖长出来。茎数接近计划茎数的八成时，准备排水。",
      "茎数达到计划茎数约 80% 时排水。晒到鸡爪裂，或田面发白、裂缝里见白根、叶子挺直、颜色褪淡。大约晒 5 到 7 天。旺苗、叶色过深、低洼冷浆、秸秆还田后根系发黑的田，提早晒、晒重一些。弱苗、茎数不够、漏水田和保水差的沙地，晚晒、轻晒，或这一次不晒。盐碱田不排水晒，灌大约 10 厘米深水来控制无效分蘖。大约三分之一的植株已经拔节时，把水灌回去。",
      "晒完后建立水层。孕穗保持约 5 厘米。连续 3 天低于 18℃ 时，加深到 15 到 20 厘米，水温不低于 18℃，过后回到 3 到 5 厘米。",
      "灌一次浅水，渗到脚窝还有水，再灌下一次。抽穗后大约 30 天内保持田里能接上水。",
      "保水好的田在成熟前约 15 天、保水差的田约 7 天，灌最后一次浅水。",
    ],
  },
};

const STRAW_NOTES = [
  "收获后切碎，翻入 15 到 20 厘米，使翻压落在泡田 30 天以前。春季临近泡田才掩埋鲜秸秆时，甲烷增加，也容易漂秆、抑制分蘖。做不到秋翻时，降低还田量或改炭化、堆腐，生育期水层仍按选定的那一类。",
  "护苗水不淹没秧心。不因为还田改成深水。",
  "浅水完成增温和护苗，随即转入湿润或薄水。还田当年避免长期闷在深水里。北部寒地仍留薄水，不以晒田代替护苗，也不晒到开裂。",
  "不因还田单独改这一期水位，也不改成长期深水。",
  "茎数达到计划茎数约 80% 时晒田。生产上晒到见缝、见白根，大约 5 到 7 天。弱苗和盐碱地推迟或不晒。",
  "冷害深水照常进行。预报连续 3 天低于 18℃ 时，临时灌到 15 到 20 厘米，水温不低于 18℃，过后退回 3 到 5 厘米。抽穗开花保持 3 到 5 厘米。高还田量时，晒田之后回到薄水。",
  "前水不见后水：灌一次浅水，自然渗到脚窝仍有少量水再灌下一次。冷害深水结束后尽快退水。",
  "黄熟落干。保水好的田在成熟前约 15 天、保水差的田约 7 天灌最后一次浅水，避免过早断水。",
];

function choosePath(answers) {
  const canWater = answers.water === "few" || answers.water === "repeat";
  const ridgeForFurrow = answers.ridge === "easy" || answers.ridge === "unknown";
  if (ridgeForFurrow && answers.drain === "ok" && canWater) return "furrow";
  const ridgeForAwd = answers.ridge === "hard" || answers.ridge === "unknown";
  const awdWater = answers.water === "repeat" || (answers.water === "few" && answers.area === "large");
  if (ridgeForAwd && answers.field_even === "even" && answers.drain === "ok" && awdWater) return "awd";
  return "sun";
}

function monthDay(isoDate, offset) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + offset);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function coldParagraph(headingDate) {
  const windowText = headingDate
    ? `大约抽穗前 20 天到抽穗后 10 天（${monthDay(headingDate, -20)}到${monthDay(headingDate, 10)}）`
    : "大约抽穗前 20 天到抽穗后 10 天";
  return `${windowText}。这段时间遇 17℃ 上下的低温，空壳会明显增加。管水上先把水层加深（高温或低温宜灌深水 6 厘米以上），低温过后再回到薄水或沟灌。深水用在抽穗前 20 天到抽穗后 10 天。`;
}

function buildAdvice(answers, audience) {
  const path = choosePath(answers);
  const chosen = PATH_TEXT[path];
  const stages = chosen.stages.map((text, index) => {
    const parts = [text];
    if (path === "furrow" && index === 0 && answers.field_even === "uneven") {
      parts.push("水主要留在沟里，不必先把整块田找平。");
    }
    if (index === 5) parts.push(coldParagraph(answers.expected_heading_date));
    if (answers.straw_return === "yes") parts.push(STRAW_NOTES[index]);
    return { name: STAGES[index][0], icon: STAGES[index][1], text: parts.join("") };
  });
  const notes = audience === "org" ? ORG_CASES[path].slice() : [];
  if (answers.straw_return === "yes" && audience === "org") notes.push(STRAW_CASE);
  return {
    path,
    name: chosen.name,
    chosen: `本次采用${chosen.name}。${chosen.summary}`,
    stages,
    notes,
  };
}

function fieldReady(answers) {
  return REQUIRED_FIELDS.every((name) => answers[name]);
}

function readFieldAnswers(form) {
  const answers = {};
  REQUIRED_FIELDS.forEach((name) => {
    answers[name] = form.elements[name].value;
  });
  answers.expected_heading_date = form.elements.expected_heading_date.value;
  return answers;
}

function init(counties) {
  const provinceSelect = document.querySelector("#province");
  const citySelect = document.querySelector("#city");
  const countySelect = document.querySelector("#county");
  const homeScreen = document.querySelector("#screen-home");
  const placeScreen = document.querySelector("#screen-place");
  const fieldButton = document.querySelector("#show-field");
  const audienceNote = document.querySelector("#audience-note");
  const fieldForm = document.querySelector("#field-form");
  const adviceButton = document.querySelector("#show-advice");
  const adviceScreen = document.querySelector("#screen-advice");
  const adviceStages = document.querySelector("#advice-stages");
  const page = document.querySelector(".page");
  let selectedRow = null;

  function syncAdvice() {
    adviceButton.disabled = !selectedRow
      || !fieldReady(readFieldAnswers(fieldForm))
      || !groupChosen(fieldForm, "aware")
      || !groupChosen(fieldForm, "current");
  }

  function hideFlow() {
    homeScreen.hidden = true;
    document.querySelectorAll(".intro").forEach((section) => {
      section.hidden = true;
    });
    placeScreen.hidden = true;
    fieldForm.hidden = true;
    adviceScreen.hidden = true;
  }

  function showHome() {
    hideFlow();
    homeScreen.hidden = false;
    page.classList.add("is-home");
  }

  function showIntro(name) {
    hideFlow();
    document.querySelector(`#screen-${name}`).hidden = false;
    page.classList.remove("is-home");
  }

  function showPlace() {
    hideFlow();
    placeScreen.hidden = false;
    fieldButton.hidden = !selectedRow;
    page.classList.remove("is-home");
  }

  function showFieldForm() {
    hideFlow();
    fieldForm.hidden = false;
    page.classList.remove("is-home");
    syncAdvice();
    fieldForm.scrollIntoView({ block: "start" });
  }

  function renderAdvice() {
    const answers = readFieldAnswers(fieldForm);
    const advice = buildAdvice(answers, document.body.dataset.audience);
    adviceStages.replaceChildren();
    const intro = document.createElement("div");
    intro.className = "advice-intro";
    const chosen = document.createElement("p");
    chosen.className = "advice-chosen";
    chosen.textContent = advice.chosen;
    intro.append(chosen);
    advice.notes.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      intro.append(paragraph);
    });
    adviceStages.append(intro);
    advice.stages.forEach((stage) => {
      const section = document.createElement("section");
      section.className = "stage";
      const image = document.createElement("img");
      image.src = stage.icon;
      image.alt = "";
      const body = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = stage.name;
      const text = document.createElement("p");
      text.textContent = stage.text;
      body.append(title, text);
      section.append(image, body);
      adviceStages.append(section);
    });
    if (selectedRow) {
      const climate = document.createElement("section");
      climate.className = "advice-climate";
      const title = document.createElement("h3");
      title.textContent = "当地气候";
      const list = document.createElement("ol");
      const grades = (typeof COLD_GRADES !== "undefined" && COLD_GRADES[selectedRow.gb_code]) || { july: [], aug: [] };
      const heat = typeof HEAT_GRADES === "undefined"
        ? null
        : (HEAT_GRADES[selectedRow.gb_code] || { flower: [], grain: [] });
      formatClimateLines(selectedRow, document.body.dataset.audience, grades, heat).forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        list.append(item);
      });
      const foot = document.createElement("p");
      foot.textContent = formatClimateFoot(selectedRow, document.body.dataset.audience);
      climate.append(title, list, foot);
      adviceStages.append(climate);
    }
    const footer = document.createElement("p");
    footer.className = "advice-foot";
    footer.textContent = "本指南仅为决策辅助，管水安排以当地农技规程为准，产量、用水安全与冷害防御优先。";
    adviceStages.append(footer);
  }

  function showAdvice() {
    hideFlow();
    adviceScreen.hidden = false;
    page.classList.remove("is-home");
    renderAdvice();
    adviceScreen.scrollIntoView({ block: "start" });
  }

  const provinces = PROVINCE_ORDER.filter((name) => counties.some((row) => row.province === name));
  fillSelect(provinceSelect, provinces);

  function setAudience(audience) {
    document.body.dataset.audience = audience;
    audienceNote.textContent = AUDIENCE_NOTE[audience];
    document.querySelectorAll("[data-audience]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.audience === audience));
    });
    document.querySelectorAll(".intro-copy").forEach((node) => {
      node.hidden = node.dataset.for !== audience;
    });
    if (!adviceScreen.hidden) renderAdvice();
  }

  setAudience("farm");
  document.querySelectorAll("[data-audience]").forEach((button) => {
    button.addEventListener("click", () => {
      setAudience(button.dataset.audience);
    });
  });

  provinceSelect.addEventListener("change", () => {
    const cities = sortedUnique(
      counties.filter((row) => row.province === provinceSelect.value).map((row) => row.city)
    );
    fillSelect(citySelect, cities);
    fillSelect(countySelect, []);
    selectedRow = null;
    showPlace();
  });

  citySelect.addEventListener("change", () => {
    const names = sortedUnique(
      counties
        .filter((row) => row.province === provinceSelect.value && row.city === citySelect.value)
        .map((row) => row.county)
    );
    fillSelect(countySelect, names);
    selectedRow = null;
    showPlace();
  });

  countySelect.addEventListener("change", () => {
    selectedRow = counties.find((item) => (
      item.province === provinceSelect.value
      && item.city === citySelect.value
      && item.county === countySelect.value
    )) || null;
    if (selectedRow) showFieldForm();
    else showPlace();
  });

  document.querySelector("#start-guide").addEventListener("click", showPlace);
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => showIntro(button.dataset.screen));
  });
  document.querySelectorAll("[data-back='home']").forEach((button) => {
    button.addEventListener("click", showHome);
  });
  fieldButton.addEventListener("click", showFieldForm);
  document.querySelector("#back-from-field").addEventListener("click", showPlace);
  document.querySelector("#back-from-advice").addEventListener("click", showFieldForm);
  adviceButton.addEventListener("click", showAdvice);

  const headingDate = document.querySelector("#expected-heading-date");
  function syncDateMask() {
    headingDate.classList.toggle("has-value", Boolean(headingDate.value));
  }
  headingDate.addEventListener("change", syncDateMask);
  headingDate.addEventListener("input", syncDateMask);
  fieldForm.addEventListener("change", syncAdvice);
  fieldForm.addEventListener("input", syncAdvice);
}

async function loadCountyText() {
  try {
    const response = await fetch("data/county_climate.csv");
    if (response.ok) return await response.text();
  } catch (error) {
    // 直接双击打开 html 时，浏览器不允许读取旁边的 csv。
  }
  if (typeof COUNTY_CLIMATE_CSV === "string" && COUNTY_CLIMATE_CSV) {
    return COUNTY_CLIMATE_CSV;
  }
  throw new Error("missing");
}

async function start() {
  const error = document.querySelector("#load-error");
  try {
    const counties = parseCsv(await loadCountyText());
    if (!counties.length) throw new Error("empty");
    init(counties);
  } catch (cause) {
    error.hidden = false;
    error.textContent = "县表没有读到。";
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", start);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseCsv, formatClimateLines, formatClimateFoot, fieldReady, choosePath, buildAdvice };
}
