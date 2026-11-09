const fs = require("fs");
const path = require("path");
const { parseCsv, formatClimateLines, formatClimateFoot, fieldReady, choosePath, buildAdvice } = require("./app.js");
const coldRaw = fs.readFileSync(path.join(__dirname, "data", "cold_grades.js"), "utf8");
const coldGrades = JSON.parse(coldRaw.replace(/^window\.COLD_GRADES = /, "").replace(/;\s*$/, ""));
const heatRaw = fs.readFileSync(path.join(__dirname, "data", "heat_grades.js"), "utf8");
const heatGrades = JSON.parse(heatRaw.replace(/^window\.HEAT_GRADES = /, "").replace(/;\s*$/, ""));

const csvPath = path.join(__dirname, "data", "county_climate.csv");
const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) {
    failures.push(`${name}\n  实际：${actual}\n  期望：${expected}`);
  }
}

check("县数", String(rows.length), "267");

const wuchang = rows.find((row) => row.county === "五常市");
const wuchangGrades = coldGrades[wuchang.gb_code];
const wuchangHeat = heatGrades[wuchang.gb_code];
const farmLines = formatClimateLines(wuchang, "farm", wuchangGrades, wuchangHeat);
const orgLines = formatClimateLines(wuchang, "org", wuchangGrades, wuchangHeat);
check("五常平均", farmLines[0], "1991–2020年5–9月平均 18.7℃、降水 598 mm。气温约每10年升高 0.44℃，降水约每10年增加 22 mm。");
check("五常距平", farmLines[1], "2023年、2024年5–9月的月平均气温，比这30年分别高 5.3℃、3.1℃。");
check("五常低温", farmLines[2], "1991–2025年里，7月有 1 年出现轻度冷害；8月上旬，有 8 年出现轻度冷害，有 2 年出现中度冷害，有 4 年出现重度冷害。孕穗开花期没有出现热害。");
if (/17℃|19℃|≤|灌浆/.test(farmLines[2])) failures.push("种田版低温句写出了阈值或灌浆期");
check("项目版平均", orgLines[0], "多年5–9月平均气温 18.7℃、降水 598 mm。气温约每10年升高 0.44℃，降水约每10年增加 22 mm。");
check("项目版低温", orgLines[2], "1991–2025年，7月有 1 年出现轻度冷害；8月上旬在抽穗开花时，有 8 年出现轻度冷害，有 2 年出现中度冷害，有 4 年出现重度冷害。未填抽穗日时，障碍型冷害根据7月孕穗，8月上旬抽穗开花统一计算。持续 2 天为轻度，3～4 天为中度，5 天及以上为重度。这种低温会使空壳明显增加。");
check("项目版热害", orgLines[3], "孕穗开花期没有出现热害。热害按7月1日至8月20日孕穗开花计算。日最高气温达到 35℃ 并连续 3 天及以上，计入危害积温。不超过 15℃·d 为轻度，超过 15℃·d 至 30℃·d 为中度，超过 30℃·d 为重度。这种高温会使空壳增加、粒重下降。");
if (orgLines.join("").includes("灌浆")) failures.push("项目版仍写了灌浆期");
if (farmLines.join("").includes("缺") || farmLines.join("").includes("留空") || farmLines.join("").includes("未达到")) {
  failures.push("种田版正文出现了缺测或未达说明");
}
check("种田版站", formatClimateFoot(wuchang, "farm"), "气候数据来自尚志气象站");
check("项目版脚注", formatClimateFoot(wuchang, "org"), "气候数据来自尚志气象站（约 64 km）\n多年平均按气候标准期为 1991–2020\n冷害判断标准：QX/T 101—2009\n热害判断标准：GB/T 37744—2019");
if (formatClimateFoot(wuchang, "farm").includes("km") || formatClimateFoot(wuchang, "org").includes("只作参考")) {
  failures.push("脚注写了种田版距离或只作参考");
}

const beipiao = rows.find((row) => row.county === "北票市");
const beipiaoFarm = formatClimateLines(beipiao, "farm", coldGrades[beipiao.gb_code], heatGrades[beipiao.gb_code])[2];
if (!beipiaoFarm.endsWith("孕穗开花期有 7 年出现轻度热害，有 2 年出现中度热害，有 2 年出现重度热害。") || beipiaoFarm.includes("灌浆")) {
  failures.push(`北票种田版热害：${beipiaoFarm}`);
}
const beipiaoOrg = formatClimateLines(beipiao, "org", coldGrades[beipiao.gb_code], heatGrades[beipiao.gb_code]);
if (!beipiaoOrg[3].startsWith("孕穗开花期有 7 年出现轻度热害，有 2 年出现中度热害，有 2 年出现重度热害。") || beipiaoOrg.join("").includes("灌浆")) {
  failures.push(`北票项目版热害：${beipiaoOrg[3]}`);
}

const drier = rows.find((row) => Number(row.prcp_trend_mm_per_10y) < 0);
if (!formatClimateLines(drier, "farm", coldGrades[drier.gb_code])[0].includes("减少")) {
  failures.push(`降水倾向为负时未写减少：${drier.county}`);
}
const cooler = rows.find((row) => Number(row.t59_anom_2024) < 0);
const coolerLine = formatClimateLines(cooler, "farm", coldGrades[cooler.gb_code])[1];
if (!coolerLine.includes("低 ") || !coolerLine.includes("高 ")) {
  failures.push(`正负距平未分开写：${cooler.county} ${coolerLine}`);
}
if (rows.some((row) => row.t59_anom_2025 !== "")) {
  failures.push("2025 年距平不应有数");
}

const page = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
[
  "选择您所在的位置，综合田块信息生成管水建议",
  "田块灌排水是否通畅？",
  "通畅，进出水都方便",
  "不畅，进水或排水费劲",
  "请勾选您了解的管水方式：",
  "开沟的方便程度？",
  "可反复灌排水",
  "100亩以内",
  "生成管水建议",
  "晒田",
  "田面是否平整？",
  "比较平整，水能铺开",
  "是否秸秆还田？",
  "预计哪天抽穗？（可以不填）",
  "看管水建议",
].forEach((sentence) => {
  if (!page.includes(sentence)) failures.push(`页面缺少定稿句子：${sentence}`);
});
const form = page.slice(page.indexOf('id="field-form"'), page.indexOf('id="screen-advice"'));
if (form.includes("结果用途") || form.includes("移栽") || form.includes("土壤")) {
  failures.push("页面写入了已删题目");
}
if (page.includes("水和灌排") || page.includes("起垄和田面") || page.includes("抽穗日")) {
  failures.push("页面仍有已删分类");
}
const ready = {
  area: "small",
  drain: "ok",
  water: "repeat",
  ridge: "easy",
  field_even: "uneven",
  straw_return: "no",
};
if (!fieldReady(ready)) failures.push("必选题齐了仍不能继续");
if (fieldReady({ ...ready, water: "" })) failures.push("缺水源仍能继续");
if (!fieldReady({ ...ready, expected_heading_date: "" })) failures.push("抽穗日留空被当成必填");

const furrowAnswers = {
  area: "small",
  drain: "ok",
  water: "few",
  ridge: "easy",
  field_even: "uneven",
  straw_return: "no",
  expected_heading_date: "2026-08-01",
};
check("开沟", choosePath(furrowAnswers), "furrow");
check("晒田", choosePath({ ...furrowAnswers, drain: "poor" }), "sun");
check("小面积几次灌水", choosePath({
  area: "small",
  drain: "ok",
  water: "few",
  ridge: "hard",
  field_even: "even",
  straw_return: "no",
  expected_heading_date: "",
}), "sun");
check("大面积几次灌水", choosePath({
  area: "large",
  drain: "ok",
  water: "few",
  ridge: "hard",
  field_even: "even",
  straw_return: "yes",
  expected_heading_date: "",
}), "awd");
const furrowAdvice = buildAdvice(furrowAnswers, "farm");
if (!furrowAdvice.stages[5].text.includes("大约抽穗前 20 天到抽穗后 10 天（7月12日到8月11日）")) {
  failures.push(`抽穗窗口未写入孕穗开花：${furrowAdvice.stages[5].text}`);
}
if (buildAdvice({ ...furrowAnswers, expected_heading_date: "" }, "farm").stages[5].text.includes("（7月")) {
  failures.push("未填抽穗日仍写了括号日期");
}
if (!furrowAdvice.stages[0].text.includes("不必先把整块田找平")) {
  failures.push("高低不平的开沟田未写沟里留水");
}
if (furrowAdvice.stages.join("").includes("50.8%") || furrowAdvice.notes.length) {
  failures.push("种田版写入了论文案例");
}
const orgAdvice = buildAdvice(furrowAnswers, "org");
if (!orgAdvice.notes.some((line) => line.includes("50.8%")) || !orgAdvice.notes.some((line) => line.includes("各自引用"))) {
  failures.push("机构版未附上垄作案例或未分开引用两种降幅");
}

if (failures.length) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log("气候三行核对通过");
