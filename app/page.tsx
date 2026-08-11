import { getSiteText } from "./site-content";

const results = [
  { event: "DawgCTF 2026", place: "56", points: "9 760", accent: true },
  { event: "BlueHens CTF 2026", place: "58", points: "1 620" },
  { event: "TRX CTF 2026", place: "39", points: "327" },
  { event: "UMassCTF 2026", place: "109", points: "2 424" },
];

const writeups = [
  { cat: "WEB", title: "MemeSearch", detail: "Boolean oracle · MySQL · UNION", tone: "lime" },
  { cat: "REV", title: "Pyramid²", detail: "JIT · control flow · reversing", tone: "yellow" },
  { cat: "OSINT", title: "Signal in the smoke", detail: "Geolocation · imagery · attribution", tone: "green" },
];

export const dynamic = "force-dynamic";

export default async function Home() {
  const text = await getSiteText();
  return (
    <main className="public-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Ambr0s1a! — на початок">
          <img src="/ambr0s1a-logo.jpg" alt="Логотип Ambr0s1a!" />
          <span>Ambr0s1a!</span>
        </a>
        <nav className="public-nav" aria-label="Основна навігація">
          <a href="#about">{text["public.nav.team"]}</a><a href="#results">{text["public.nav.ctf"]}</a><a href="#writeups">{text["public.nav.writeups"]}</a>
        </nav>
        <a className="pill-button dark" href="/workspace"><span className="status-dot" />{text["public.nav.workspace"]}</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> {text["public.hero.eyebrow"]}</p>
          <h1>{text["public.hero.title1"]}<br /><em>{text["public.hero.title2"]}</em></h1>
          <p className="hero-lead">{text["public.hero.lead"]}</p>
          <div className="hero-actions">
            <a className="pill-button primary" href="#writeups">{text["public.hero.writeups"]} <span>↗</span></a>
            <a className="text-link" href="#results">{text["public.hero.results"]} <span>↓</span></a>
          </div>
          <div className="category-row" aria-label="Категорії команди">
            {['PWN','REVERSE','WEB','CRYPTO','OSINT','FORENSICS'].map((item)=><span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="hero-mark" aria-hidden="true">
          <div className="logo-disc"><img src="/ambr0s1a-logo.jpg" alt="" /></div>
          <div className="orbit orbit-one">01</div><div className="orbit orbit-two">{'{ flag }'}</div>
          <div className="event-ticket"><span>{text["public.hero.next"]}</span><strong>{text["public.hero.nextName"]}</strong><small>{text["public.hero.nextDate"]}</small></div>
        </div>
      </section>

      <section className="ticker" aria-label="Принципи роботи"><div>
        <span>{text["public.ticker.one"]}</span><i>✦</i><span>{text["public.ticker.two"]}</span><i>✦</i><span>{text["public.ticker.three"]}</span><i>✦</i><span>{text["public.ticker.four"]}</span><i>✦</i>
      </div></section>

      <section className="about-section" id="about">
        <div className="section-label">{text["public.about.label"]}</div>
        <div className="about-grid">
          <h2>{text["public.about.title1"]}<br /><span>{text["public.about.title2"]}</span></h2>
          <div>
            <p>{text["public.about.text"]}</p>
            <div className="mini-stats"><div><strong>{text["public.about.members"]}</strong><span>{text["public.about.membersLabel"]}</span></div><div><strong>{text["public.about.disciplines"]}</strong><span>{text["public.about.disciplinesLabel"]}</span></div><div><strong>{text["public.about.curiosity"]}</strong><span>{text["public.about.curiosityLabel"]}</span></div></div>
          </div>
        </div>
      </section>

      <section className="results-section" id="results">
        <div className="section-heading"><div><div className="section-label">{text["public.results.label"]}</div><h2>{text["public.results.title"]}</h2></div><span className="archive-link">{text["public.results.archive"]}</span></div>
        <div className="results-table">
          <div className="result-head"><span>{text["public.results.event"]}</span><span>{text["public.results.place"]}</span><span>{text["public.results.points"]}</span><span>{text["public.results.status"]}</span></div>
          {results.map((r)=><article className={r.accent ? 'featured-result' : ''} key={r.event}><div><span className="result-index">{String(results.indexOf(r)+1).padStart(2,'0')}</span><strong>{r.event}</strong></div><b>#{r.place}</b><span>{r.points}</span><span className="complete">{text["public.results.complete"]}</span></article>)}
        </div>
      </section>

      <section className="writeups-section" id="writeups">
        <div className="section-heading"><div><div className="section-label">{text["public.writeups.label"]}</div><h2>{text["public.writeups.title"]}</h2></div><a className="text-link" href="/workspace">{text["public.writeups.all"]}</a></div>
        <div className="writeup-grid">
          {writeups.map((w, i)=><article className={`writeup-card ${w.tone}`} key={w.title}><div className="writeup-top"><span>{w.cat}</span><small>0{i+1}</small></div><div className="terminal-art"><span>$ ./solve</span><b>{i===0?'TRUE → FALSE → FLAG':i===1?'JIT [ 0x13f7 ]':'LAT 50.4 · LON 30.5'}</b></div><h3>{w.title}</h3><p>{w.detail}</p><span className="read-more">{text["public.writeups.read"]}</span></article>)}
        </div>
      </section>

      <footer><div className="brand"><img src="/ambr0s1a-logo.jpg" alt=""/><span>Ambr0s1a!</span></div><p>{text["public.footer.tagline"]}</p><a href="/workspace">{text["public.footer.workspace"]}</a></footer>
    </main>
  );
}
