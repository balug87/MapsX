// Place search via OpenStreetMap's Nominatim geocoder (free, no key).

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export function initSearch(input, resultsEl, onPick) {
  let timer = null;
  let lastQuery = '';
  let abort = null;

  async function run(q) {
    lastQuery = q;
    if (abort) abort.abort();
    abort = new AbortController();
    let results;
    try {
      const url = `${ENDPOINT}?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: abort.signal, headers: { Accept: 'application/json' } });
      results = await res.json();
    } catch (e) {
      if (e.name === 'AbortError') return;
      results = [];
    }
    if (q !== lastQuery) return;
    render(results);
  }

  function render(results) {
    resultsEl.innerHTML = '';
    resultsEl.hidden = results.length === 0;
    for (const r of results) {
      const li = document.createElement('li');
      li.textContent = r.display_name;
      li.tabIndex = 0;
      const pick = () => {
        resultsEl.hidden = true;
        input.value = r.display_name.split(',')[0];
        onPick(r);
      };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
      resultsEl.appendChild(li);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) {
      resultsEl.hidden = true;
      return;
    }
    timer = setTimeout(() => run(q), 450);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q) run(q);
    } else if (e.key === 'Escape') {
      resultsEl.hidden = true;
    }
  });
  document.addEventListener('click', (e) => {
    if (!resultsEl.contains(e.target) && e.target !== input) resultsEl.hidden = true;
  });
}
