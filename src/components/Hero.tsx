/** Greeting banner at the top of the dashboard, with a truck driving along a route. */
export function Hero({
  name,
  total,
  onTheMove,
  needAttention,
  delivered,
}: {
  name: string;
  total: number;
  onTheMove: number;
  needAttention: number;
  delivered: number;
}) {
  const hour = Number(
    new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = name.split(" ")[0];

  const headline =
    total === 0
      ? "Add your first parcel"
      : onTheMove === 0
        ? "Everything has arrived"
        : `${onTheMove} parcel${onTheMove === 1 ? "" : "s"} on the move`;

  const sub =
    total === 0
      ? "Pick a courier, paste a tracking number, and watch it appear here."
      : needAttention > 0
        ? `${needAttention} need${needAttention === 1 ? "s" : ""} a look. ${delivered} delivered so far.`
        : `Nothing is late. ${delivered} delivered so far.`;

  return (
    <section className="hero reveal px-6 py-6 sm:px-9 sm:py-8">
      <div className="relative z-10 grid items-center gap-6 md:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-100/90">
            {greeting}, {first}
          </div>
          <h1 className="mt-2 text-4xl font-extrabold leading-[1.02] sm:text-5xl">{headline}</h1>
          <p className="mt-3 max-w-md text-base text-sky-50/90">{sub}</p>
        </div>

        <svg viewBox="0 0 420 130" className="w-full" role="img" aria-label="A delivery truck driving along a route">
          {/* clouds */}
          <g className="cloud" opacity="0.35" fill="#fff">
            <ellipse cx="60" cy="22" rx="30" ry="9" />
            <ellipse cx="82" cy="17" rx="18" ry="8" />
          </g>
          <g className="cloud" opacity="0.25" fill="#fff" style={{ animationDelay: "-13s" }}>
            <ellipse cx="40" cy="48" rx="24" ry="7" />
            <ellipse cx="58" cy="44" rx="14" ry="6" />
          </g>

          {/* route */}
          <line x1="0" y1="104" x2="420" y2="104" stroke="rgba(255,255,255,0.28)" strokeWidth="14" strokeLinecap="round" />
          <line className="road" x1="0" y1="104" x2="420" y2="104" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />

          {/* destination pin */}
          <g transform="translate(372 52)">
            <path d="M14 0C6.3 0 0 6.2 0 13.8 0 24 14 40 14 40s14-16 14-26.2C28 6.2 21.7 0 14 0z" fill="#fbbf24" />
            <circle cx="14" cy="13.5" r="5" fill="#0f3a68" />
          </g>

          {/* truck */}
          <g className="truck-run">
            <g transform="translate(0 56)">
              <rect x="0" y="2" width="44" height="30" rx="4" fill="#fff" />
              <rect x="6" y="9" width="32" height="5" rx="2.5" fill="#38bdf8" />
              <rect x="6" y="18" width="20" height="5" rx="2.5" fill="#a5b4fc" />
              <path d="M46 12h14.5c2 0 3.8 1 4.8 2.7L71 24v8H46z" fill="#fbbf24" />
              <path d="M52 15h7.5l5 7.5H52z" fill="#0f3a68" opacity="0.85" />
              <circle cx="15" cy="36" r="7" fill="#0f3a68" />
              <circle cx="15" cy="36" r="2.8" fill="#fff" />
              <circle cx="58" cy="36" r="7" fill="#0f3a68" />
              <circle cx="58" cy="36" r="2.8" fill="#fff" />
            </g>
          </g>
        </svg>
      </div>
    </section>
  );
}
