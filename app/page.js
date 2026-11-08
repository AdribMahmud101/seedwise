import AppLoader from "./AppLoader";

export default function Page() {
  return (
    <div id="app" suppressHydrationWarning>
      <div className="boot">
        <span className="wordmark">রোপণ</span>
        <p>Opening your field notebook…</p>
      </div>
      <AppLoader />
    </div>
  );
}
