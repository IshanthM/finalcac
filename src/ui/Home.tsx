export function Home() {
  const base = import.meta.env.BASE_URL;
  return (
    <main class="page">
      <h1>Resonance</h1>
      <p>Phones as a tamper-alarm network for a store. Listener phones hear a Resonance tag ring when its pin is pulled, and tell staff <em>where</em>.</p>
      <p class="muted">Build in progress: capture and the debug recorder come first.</p>
      <a class="btn btn-primary" href={`${base}?debug=1`}>Open debug recorder</a>
    </main>
  );
}
