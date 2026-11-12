import AppLoader from "./AppLoader";

export default function Page() {
  return (
    <div id="app" suppressHydrationWarning>
      <div className="boot" role="status" aria-label="Loading SeedWise">
        <img
          className="boot-mark"
          src="/assets/mark.svg"
          alt=""
          width="64"
          height="64"
        />
        <span className="wordmark">SeedWise</span>
        <p className="boot-tagline">
          Plant smarter every season · NASA Earth data
        </p>
        <p className="boot-note">Opening your field notebook…</p>
      </div>
      <AppLoader />
    </div>
  );
}
