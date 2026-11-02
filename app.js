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

const REQUIRED_FIELDS = ["drain", "water", "ridge", "field_even", "straw_return"];

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

const PATH_TEXT = {
  furrow: {
    name: "起垄沟灌",
    summary: "整地前做成垄和沟，灌溉水留在沟里，垄面不长期积水。",
    stages: [
      "移栽前做成垄和沟。垄宽约 80 厘米，沟宽约 20 厘米，沟深约 15 厘米，可按当地机具调整。垄面不长期积水，沟内可蓄水。",
      "短时间浅水护苗，约 1 到 3 厘米，或沟水短时间略漫垄面。不要长期深水。",
      "改为沟灌。水留在沟中，水面宜低于垄面 5 到 10 厘米，水不上垄面。",
      "沟水仍低于垄面 5 到 10 厘米。垄面薄水或湿润，约在田面下 5 厘米到田面上 3 厘米。不要长期淹过垄面。控水要延续到抽穗，不能只在分蘖期进行。",
      "搁田，约在田面下 20 到 10 厘米。沟内保留底墒，不要只排干再反复灌上。分蘖末期才临时开沟，不单独作为一条建议。",
      "平时沟水低于垄面、垄面不淹。遇低温先加深水层，再回到沟灌。",
      "沟水仍低于垄面 5 到 10 厘米，垄面不长期积水。",
      "落干，收获前 5 到 10 天断水。",
    ],
  },
  awd: {
    name: "干湿交替",
    summary: "平作，不挖沟。水落到下限就灌，升到上限就停，高出上限就排。水位按 NY/T 4718—2025。",
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
  saving: {
    name: "通用节水栽培",
    summary: "按 DB23/T 3460—2023。花达水插秧，返青水层为苗高的 1/3；分蘖和灌浆落到细缝再灌，孕穗遇 17℃ 以下低温时深水护胎。",
    stages: [
      "土壤含水量降到 30% 以下再翻地，翻深 18 到 22 厘米，旋耕深 14 到 16 厘米。旱整平、免搅浆，10 米内平整度误差不超过 1 厘米。插秧前 7 到 10 天上水泡田。",
      "插秧时田面呈花达水，不建立深水层。",
      "插秧后至返青，水层深度为苗高的 1/3。",
      "有雨就蓄雨，蓄水上限 5 厘米。无雨灌 3 厘米，自然落干到土壤裂缝 1 到 2 毫米再灌。如此反复，直到孕穗期。",
      "仍按分蘖期这一套，反复到孕穗期。规程没有另写晒田。",
      "以雨水为主，蓄水上限 5 厘米。无雨则灌 5 厘米，自然落干到土壤湿润、无裂缝再灌。减数分裂期（剑叶和倒二叶叶枕距 ±3 厘米）预报 17℃ 以下低温时，灌 15 到 20 厘米深水护胎，低温过后恢复这一水层。",
      "有雨就蓄雨，蓄水上限 3 厘米。无雨灌 3 厘米，自然落干到土壤裂缝 1 到 2 毫米再灌，反复到蜡熟末期。",
      "上述灌法到蜡熟末期为止。完熟期收获。规程未写收获前几天断水。",
    ],
  },
};

const STRAW_NOTES = [
  "收获后切碎，翻入 15 到 20 厘米，使翻压落在泡田 30 天以前。春季临近泡田才掩埋鲜秸秆，既增加甲烷，也容易漂秆、抑制分蘖。做不到秋翻时，降低还田量或改炭化、堆腐，不要加大生育期水层。",
  "护苗水不淹没秧心。不因为还田改成深水。",
  "浅水完成增温和护苗，随即转入湿润或薄水。还田当年避免长期闷在深水里。北部寒地仍留薄水，不以晒田代替护苗，也不晒到开裂。",
  "不因还田单独改这一期水位，也不改成长期深水。",
  "茎数达到计划茎数约 80% 时晒田。生产上晒到见缝、见白根，大约 5 到 7 天。弱苗和盐碱地推迟或不晒。",
  "还田不取消冷害深水。预报连续 3 天低于 18℃ 时，临时灌到 15 到 20 厘米，水温不低于 18℃，过后退回 3 到 5 厘米。抽穗开花保持 3 到 5 厘米。高还田量时，晒田之后不要回到全季 10 到 50 毫米的水层。",
  "前水不见后水：灌一次浅水，自然渗到脚窝仍有少量水再灌下一次。冷害深水结束后尽快退水。",
  "黄熟落干。保水好的田在成熟前约 15 天、保水差的田约 7 天灌最后一次浅水，避免过早断水。",
];

function choosePath(answers) {
  if (answers.drain === "poor" || answers.water === "unstable") return "saving";
  if (
    answers.ridge === "easy"
    && answers.drain === "ok"
    && (answers.water === "stable_or_basic" || answers.water === "sufficient")
  ) return "furrow";
  if (
    answers.ridge === "hard"
    && answers.field_even === "even"
    && answers.water === "sufficient"
    && answers.drain === "ok"
  ) return "awd";
  return "saving";
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
  return `${windowText}。这段时间遇 17℃ 上下的低温，空壳会明显增加。管水上的做法是先把水层加深（高温或低温宜灌深水 6 厘米以上），低温过后再回到薄水或沟灌。深水要加在这一段，而不是整个夏天都深灌。`;
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
  const notes = [];
  if (path === "furrow" && audience === "org") {
    notes.push("干湿交替不是这种做法，两种降幅不能相加。");
  }
  if (answers.straw_return === "yes" && audience === "org") {
    notes.push("庆安试验里，淹灌加秸秆 6 t/hm² 时甲烷大约加倍；改成控制灌溉或间歇灌溉后，这一增排可以压到低于「淹灌、不还田」。还田几乎不减少灌溉定额。这些不改各期水位，也不改走哪一类。");
  }
  return {
    path,
    name: chosen.name,
    summaries: Object.values(PATH_TEXT).map((item) => `${item.name}：${item.summary}`),
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
  const placeScreen = document.querySelector("#screen-place");
  const climateScreen = document.querySelector("#screen-climate");
  const climateButton = document.querySelector("#show-climate");
  const fieldButton = document.querySelector("#show-field");
  const climateTitle = document.querySelector("#climate-title");
  const climateLines = document.querySelector("#climate-lines");
  const climateNote = document.querySelector("#climate-note");
  const climateFoot = document.querySelector("#climate-foot");
  const audienceNote = document.querySelector("#audience-note");
  const fieldForm = document.querySelector("#field-form");
  const adviceButton = document.querySelector("#show-advice");
  const adviceScreen = document.querySelector("#screen-advice");
  const adviceStages = document.querySelector("#advice-stages");
  let selectedRow = null;

  function syncAdvice() {
    adviceButton.disabled = !selectedRow || !fieldReady(readFieldAnswers(fieldForm));
  }

  function showPlace() {
    placeScreen.hidden = false;
    climateScreen.hidden = true;
    fieldForm.hidden = true;
    adviceScreen.hidden = true;
    climateButton.hidden = !selectedRow;
  }

  function showClimate() {
    if (!selectedRow) return;
    placeScreen.hidden = true;
    climateScreen.hidden = false;
    fieldForm.hidden = true;
    adviceScreen.hidden = true;
    renderClimate();
    climateScreen.scrollIntoView({ block: "start" });
  }

  function showFieldForm() {
    placeScreen.hidden = true;
    climateScreen.hidden = true;
    fieldForm.hidden = false;
    adviceScreen.hidden = true;
    syncAdvice();
    fieldForm.scrollIntoView({ block: "start" });
  }

  function renderAdvice() {
    const answers = readFieldAnswers(fieldForm);
    const advice = buildAdvice(answers, document.body.dataset.audience);
    adviceStages.replaceChildren();
    const intro = document.createElement("div");
    intro.className = "advice-intro";
    advice.summaries.forEach((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      intro.append(paragraph);
    });
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
    placeScreen.hidden = true;
    climateScreen.hidden = true;
    fieldForm.hidden = true;
    adviceScreen.hidden = false;
    renderAdvice();
    adviceScreen.scrollIntoView({ block: "start" });
  }

  const provinces = PROVINCE_ORDER.filter((name) => counties.some((row) => row.province === name));
  fillSelect(provinceSelect, provinces);

  function renderClimate() {
    if (!selectedRow) return;
    const audience = document.body.dataset.audience;
    climateTitle.textContent = `${selectedRow.county}气候参考`;
    climateNote.hidden = true;
    climateLines.replaceChildren();
    const grades = (typeof COLD_GRADES !== "undefined" && COLD_GRADES[selectedRow.gb_code]) || { july: [], aug: [] };
    const heat = typeof HEAT_GRADES === "undefined"
      ? null
      : (HEAT_GRADES[selectedRow.gb_code] || { flower: [], grain: [] });
    formatClimateLines(selectedRow, audience, grades, heat).forEach((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      climateLines.append(item);
    });
    climateFoot.hidden = false;
    climateFoot.textContent = formatClimateFoot(selectedRow, audience);
  }

  function setAudience(audience) {
    document.body.dataset.audience = audience;
    audienceNote.textContent = AUDIENCE_NOTE[audience];
    document.querySelectorAll("[data-audience]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.audience === audience));
    });
    if (selectedRow && !climateScreen.hidden) renderClimate();
    if (!adviceScreen.hidden) renderAdvice();
  }

  setAudience("farm");
  document.querySelectorAll("[data-audience]").forEach((button) => {
    button.addEventListener("click", () => {
      setAudience(button.dataset.audience);
    });
  });

  function hideClimate() {
    climateNote.hidden = true;
    climateLines.replaceChildren();
    climateFoot.hidden = true;
    climateFoot.textContent = "";
    climateTitle.textContent = "";
    showPlace();
  }

  provinceSelect.addEventListener("change", () => {
    const cities = sortedUnique(
      counties.filter((row) => row.province === provinceSelect.value).map((row) => row.city)
    );
    fillSelect(citySelect, cities);
    fillSelect(countySelect, []);
    selectedRow = null;
    hideClimate();
  });

  citySelect.addEventListener("change", () => {
    const names = sortedUnique(
      counties
        .filter((row) => row.province === provinceSelect.value && row.city === citySelect.value)
        .map((row) => row.county)
    );
    fillSelect(countySelect, names);
    selectedRow = null;
    hideClimate();
  });

  countySelect.addEventListener("change", () => {
    selectedRow = counties.find((item) => (
      item.province === provinceSelect.value
      && item.city === citySelect.value
      && item.county === countySelect.value
    )) || null;
    showPlace();
  });

  climateButton.addEventListener("click", showClimate);
  fieldButton.addEventListener("click", showFieldForm);
  document.querySelector("#back-from-climate").addEventListener("click", showPlace);
  document.querySelector("#back-from-field").addEventListener("click", showClimate);
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
