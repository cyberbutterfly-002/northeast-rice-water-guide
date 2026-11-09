const AWARE = ["flood", "sun", "awd", "shallow", "furrow", "none"];
const CURRENT = ["flood", "sun", "awd", "shallow", "furrow", "unknown"];

function cors(origin) {
  const allowed = origin === "https://cyberbutterfly-002.github.io"
    || origin === "http://127.0.0.1:8788"
    || origin === "http://localhost:8788";
  return {
    "access-control-allow-origin": allowed ? origin : "https://cyberbutterfly-002.github.io",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function allow(values, permitted) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((item) => permitted.includes(item)))];
}

function emptyStats() {
  return {
    submissions: 0,
    aware: Object.fromEntries(AWARE.map((key) => [key, 0])),
    current: Object.fromEntries(CURRENT.map((key) => [key, 0])),
  };
}

async function github(env, method, body) {
  const path = env.STATS_PATH || "survey-stats.json";
  const branch = env.STATS_BRANCH || "stats";
  const base = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  const url = method === "GET" ? `${base}?ref=${branch}` : base;
  return fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: "application/vnd.github+json",
      "user-agent": "rice-guide-stats",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function record(env, aware, current) {
  const branch = env.STATS_BRANCH || "stats";
  const read = await github(env, "GET");
  if (!read.ok) return read.status;
  const meta = await read.json();
  const stats = JSON.parse(atob(meta.content.replace(/\n/g, "")));
  const next = emptyStats();
  next.submissions = Number(stats.submissions) || 0;
  for (const key of AWARE) next.aware[key] = Number(stats.aware?.[key]) || 0;
  for (const key of CURRENT) next.current[key] = Number(stats.current?.[key]) || 0;
  next.submissions += 1;
  for (const key of aware) next.aware[key] += 1;
  for (const key of current) next.current[key] += 1;
  next.updated = new Date().toISOString();
  const write = await github(env, "PUT", {
    message: "记录一次问卷填写",
    content: btoa(JSON.stringify(next, null, 2) + "\n"),
    sha: meta.sha,
    branch,
  });
  return write.ok ? 200 : write.status;
}

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get("origin"));
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return new Response("只接受填写记录", { status: 405, headers });
    }
    let body = {};
    try {
      body = await request.json();
    } catch (error) {
      return new Response("请求无法读取", { status: 400, headers });
    }
    const aware = allow(body.aware, AWARE);
    const current = allow(body.current, CURRENT);
    let status = await record(env, aware, current);
    if (status === 409) status = await record(env, aware, current);
    if (status !== 200) {
      return new Response("统计没有写入", { status: 502, headers });
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...headers, "content-type": "application/json" },
    });
  },
};
