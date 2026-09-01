/* eslint-disable @next/next/no-img-element */
import { chatGPTSignInPath, getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';
const DOOMSDAY = new Date('2026-12-18T00:00:00+08:00');

export default async function Home() {
  const user = await getChatGPTUser();
  // Server-rendered countdown intentionally reflects request time.
  // eslint-disable-next-line react-hooks/purity
  const days = Math.max(0, Math.ceil((DOOMSDAY.getTime() - Date.now()) / 86400000));
  const target = user ? '/vault' : chatGPTSignInPath('/vault');

  return (
    <main className="landing-shell">
      <header className="landing-header">
        <a className="protocol-brand" href="#top" aria-label="Doomsday Protocol home">
          <span className="protocol-mark"><img src="/protocol-mark.svg" alt="" /></span>
          <span>DOOMSDAY <b>PROTOCOL</b></span>
        </a>
        <a className="landing-signin" href={target}>
          {user ? 'Enter your vault' : 'Sign in with ChatGPT'} <span>→</span>
        </a>
      </header>

      <section className="landing-stage" id="top">
        <figure className="landing-art" aria-label="Avengers Doomsday poster art">
          <img
            src="https://image.tmdb.org/t/p/w1280/jzPwsojjFStf5lR5Nm07w2hH56G.jpg"
            alt="Avengers: Doomsday poster"
          />
        </figure>

        <div className="landing-copy">
          <span className="section-kicker">THE COMPLETE MARVEL MISSION · REBUILT FOR CERTAINTY</span>
          <h1>Know what&apos;s next.<br /><span>Be ready for Doom.</span></h1>
          <p>
            A cinematic, episode-exact command center for 165 stories—now with a
            nightly slate, deadline forecast, searchable era route, saved history,
            and fail-closed progress receipts.
          </p>
          <div className="landing-actions">
            <a className="primary-action" href={target}>
              {user ? 'CONTINUE MISSION' : 'BEGIN THE MISSION'} <span>→</span>
            </a>
            <span className="landing-private">Private progress · quiet WebMCP · exact observations</span>
          </div>
        </div>

        <aside className="landing-countdown" aria-label={days + ' days until Avengers Doomsday'}>
          <span>TIME UNTIL</span>
          <strong>{days}</strong>
          <b>DAYS</b>
          <small>18 DEC 2026 · SINGAPORE</small>
        </aside>

        <section className="landing-capabilities" aria-label="Tracker capabilities">
          <div>
            <span>01 · THREE ROUTES</span>
            <strong>165 / 72 / 60</strong>
            <small>Independent progress, remaining runtime, and pace.</small>
          </div>
          <div>
            <span>02 · TONIGHT&apos;S SLATE</span>
            <strong>Built to fit</strong>
            <small>Exact next episodes and films for your available minutes.</small>
          </div>
          <div>
            <span>03 · DEADLINE MODEL</span>
            <strong>Finish forecast</strong>
            <small>Daily budget, projected finish, and honest target risk.</small>
          </div>
          <div>
            <span>04 · TRUST LAYER</span>
            <strong>Verified state</strong>
            <small>Canonical receipts; stale and duplicate events fail closed.</small>
          </div>
        </section>
        <p className="landing-credit">
          Timeline adapted from MarvelWatchList.com · Poster media via TMDB · Unofficial fan tracker
        </p>
      </section>
    </main>
  );
}
