/* Live portfolio: all content comes from the GitHub API. Change USER to switch profile. */
const USER = "senthilganesh-dev";
const API = "https://api.github.com";
const $ = (id) => document.getElementById(id);
const page = document.body.dataset.page;

const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nice = (n) => n.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const year = (d) => new Date(d).toLocaleDateString("en", { month: "short", year: "numeric" });

/* Fetch with a 10-minute cache so the 60 requests/hour GitHub limit is not hit. */
async function gh(url, raw = false) {
  const key = "gh:" + url, hit = sessionStorage.getItem(key);
  if (hit && Date.now() - JSON.parse(hit).t < 6e5) return JSON.parse(hit).d;
  const res = await fetch(url, raw ? {} : { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(res.status === 403 ? "GitHub rate limit reached. Please try again in a few minutes." : "GitHub returned " + res.status);
  const d = raw ? await res.text() : await res.json();
  try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d })); } catch (e) {}
  return d;
}
const getProfile = () => gh(`${API}/users/${USER}`);
const getRepos = async () => (await gh(`${API}/users/${USER}/repos?per_page=100&sort=pushed`)).filter((r) => !r.fork);
const getReadme = async () => { try { return await gh(`https://raw.githubusercontent.com/${USER}/${USER}/main/README.md`, true); } catch (e) { return ""; } };

/* Minimal, safe Markdown: headings, lists, links, bold, paragraphs. */
function md(src) {
  const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  let out = "", list = false;
  for (const l of src.split("\n")) {
    const t = l.trim(), li = t.match(/^[-*]\s+(.*)/);
    if (li) { if (!list) { out += "<ul>"; list = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { out += "</ul>"; list = false; }
    if (t && !/^<|^!\[|^---/.test(t) && !/^#/.test(t)) out += `<p>${inline(t)}</p>`;
  }
  return out + (list ? "</ul>" : "");
}
function sections(readme) {
  const out = []; let cur = { title: "", body: "" };
  for (const l of readme.split("\n")) {
    const h = l.match(/^#{1,3}\s+(.*)/);
    if (h) { out.push(cur); cur = { title: h[1].replace(/[^\w\s&/-]/g, "").trim(), body: "" }; } else cur.body += l + "\n";
  }
  out.push(cur);
  return out.filter((s) => s.body.trim());
}

const card = (r) => `<article class="card">
  <h3>${esc(nice(r.name))}</h3>
  <p>${esc(r.description || "No description yet. Open the repository to read more.")}</p>
  <div class="meta">${r.language ? `<span>${esc(r.language)}</span>` : ""}<span>★ ${r.stargazers_count}</span><span>Updated ${year(r.pushed_at)}</span></div>
  <div class="links"><a href="${r.html_url}" rel="noopener">Code</a>${r.homepage ? `<a href="${esc(r.homepage)}" rel="noopener">Live demo</a>` : ""}</div>
</article>`;

const fail = (el, e) => { if (el) el.innerHTML = `<p class="note">Could not load data. ${esc(e.message)} <a href="https://github.com/${USER}">View my GitHub profile</a> instead.</p>`; };

async function common() {
  const btn = document.querySelector(".menu-btn"), nav = $("nav");
  btn.addEventListener("click", () => { const o = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
  const link = document.querySelector(`[data-nav="${page}"]`); if (link) link.setAttribute("aria-current", "page");
  try { const p = await getProfile(); const n = p.name || USER; $("brand").textContent = n; $("foot-name").textContent = "© " + new Date().getFullYear() + " " + n + "."; return p; } catch (e) { return null; }
}

const pages = {
  async home(p) {
    try {
      if (!p) p = await getProfile();
      const parts = (p.name || USER).split(" ");
      $("name").innerHTML = `${esc(parts[0])} <span>${esc(parts.slice(1).join(" "))}</span>`;
      $("bio").textContent = p.bio || "Welcome to my portfolio.";
      $("avatar").src = p.avatar_url + "&s=400"; $("avatar").alt = "Portrait of " + (p.name || USER);
      const rows = [["GitHub", `<a href="${p.html_url}">${esc(USER)}</a>`], p.location && ["Location", esc(p.location)], p.company && ["Company", esc(p.company)], p.blog && ["Website", `<a href="${/^http/.test(p.blog) ? esc(p.blog) : "https://" + esc(p.blog)}">${esc(p.blog)}</a>`], p.email && ["Email", `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`], p.twitter_username && ["X / Twitter", `<a href="https://x.com/${esc(p.twitter_username)}">@${esc(p.twitter_username)}</a>`]].filter(Boolean);
      $("contact-list").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
      const [readme, repos] = await Promise.all([getReadme(), getRepos()]);
      const about = sections(readme).find((s) => /about|hi|hello|who/i.test(s.title)) || sections(readme)[0];
      $("about").innerHTML = about ? md(about.body) : `<p>${esc(p.bio || "")}</p><p>I have published ${p.public_repos} public repositories since ${year(p.created_at)}.</p>`;
      const top = [...repos].sort((a, b) => b.stargazers_count - a.stargazers_count || new Date(b.pushed_at) - new Date(a.pushed_at)).slice(0, 3);
      $("featured").innerHTML = top.map(card).join("") || "<p>No public projects yet.</p>";
    } catch (e) { fail($("about"), e); }
  },
  async projects() {
    try {
      const repos = await getRepos(), list = $("projects"), q = $("q"), sel = $("lang");
      [...new Set(repos.map((r) => r.language).filter(Boolean))].sort().forEach((l) => sel.add(new Option(l, l)));
      const draw = () => {
        const t = q.value.toLowerCase(), f = sel.value;
        const m = repos.filter((r) => (!f || r.language === f) && (r.name + " " + (r.description || "")).toLowerCase().includes(t));
        list.innerHTML = m.map(card).join("") || "<p>No projects match. Clear the search or choose All languages.</p>";
      };
      q.addEventListener("input", draw); sel.addEventListener("change", draw); draw();
    } catch (e) { fail($("projects"), e); }
  },
  async skills() {
    try {
      const repos = await getRepos(), count = {}, topics = new Set();
      repos.forEach((r) => { if (r.language) count[r.language] = (count[r.language] || 0) + 1; (r.topics || []).forEach((t) => topics.add(t)); });
      const rows = Object.entries(count).sort((a, b) => b[1] - a[1]), max = rows[0] ? rows[0][1] : 1;
      $("skills").innerHTML = rows.map(([l, n]) => `<div class="bar"><span>${esc(l)}</span><div class="track" role="img" aria-label="${n} projects"><div class="fill" style="width:${(n / max) * 100}%"></div></div><span>${n}</span></div>`).join("") || "<p>No languages detected yet.</p>";
      $("topics").innerHTML = [...topics].map((t) => `<li>${esc(t)}</li>`).join("") || "<li>Add topics to your repositories on GitHub and they will appear here.</li>";
    } catch (e) { fail($("skills"), e); }
  },
  async qualification() {
    try {
      const [p, repos, readme] = await Promise.all([getProfile(), getRepos(), getReadme()]);
      const found = sections(readme).filter((s) => /experience|education|qualification|certif|work|intern/i.test(s.title));
      $("qual").innerHTML = found.length ? found.map((s) => `<h2>${esc(s.title)}</h2><div class="prose">${md(s.body)}</div>`).join("") : `<p class="note">GitHub does not store job or education history. To show it here, add sections titled "Experience" and "Education" to your profile README (the repository named ${USER}/${USER}).</p>`;
      const ev = [{ d: p.created_at, t: "Joined GitHub" }, ...repos.map((r) => ({ d: r.created_at, t: `Created <a href="${r.html_url}">${esc(nice(r.name))}</a>${r.language ? " in " + esc(r.language) : ""}` }))].sort((a, b) => new Date(b.d) - new Date(a.d));
      $("timeline").innerHTML = ev.map((e) => `<li><time datetime="${e.d}">${year(e.d)}</time><br>${e.t}</li>`).join("");
    } catch (e) { fail($("qual"), e); }
  },
};

common().then((p) => pages[page] && pages[page](p));
