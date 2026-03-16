// Revenue calculator — loaded on admin.html
// Card rules:
//   Beer card    = 4 beers × 0.5 L = 2 L beer per card
//   Cocktail card = 2 cocktails × 0.3 L = 0.6 L drink per card
//   Cocktail mix  = 1 part alcohol : 4 parts soda (1/5 alcohol, 4/5 soda)
//
// Selling price scenarios:
//   Min (conservative) = 5 €/card  (cards sold as 2-card bundle at 10 €)
//   Max (optimistic)   = 6 €/card  (cards sold individually)

const calcBtn    = document.getElementById('calc-btn');
const resultsEl  = document.getElementById('calc-results');

calcBtn.addEventListener('click', calculate);

function calculate() {
  const beerL    = parseFloat(document.getElementById('c-beer').value)    || 0;
  const alcoholL = parseFloat(document.getElementById('c-alcohol').value) || 0;
  const sodaL    = parseFloat(document.getElementById('c-soda').value)    || 0;
  const totalCost= parseFloat(document.getElementById('c-cost').value)    || 0;

  // ── Cocktail drink liters available ──────────────────────
  // At 1:4 ratio: 1 part alcohol, 4 parts soda
  //   Total drink = alcohol / (1/5) = alcohol × 5     (limited by alcohol)
  //   Total drink = soda    / (4/5) = soda × 5/4      (limited by soda)
  const cocktailFromAlcohol = alcoholL * 5;
  const cocktailFromSoda    = sodaL * (5 / 4);
  const cocktailL           = Math.min(cocktailFromAlcohol, cocktailFromSoda);

  // ── Cards possible ────────────────────────────────────────
  const beerCards     = Math.floor(beerL / 2);
  const cocktailCards = Math.floor(cocktailL / 0.6);
  const totalCards    = beerCards + cocktailCards;

  // ── Revenue ───────────────────────────────────────────────
  const revMin = totalCards * 5;
  const revMax = totalCards * 6;

  // ── Profit ────────────────────────────────────────────────
  const profitMin = revMin - totalCost;
  const profitMax = revMax - totalCost;

  // ── Render results ────────────────────────────────────────
  setText('r-beer-cards',     beerCards);
  setText('r-cocktail-cards', cocktailCards);
  setText('r-total-cards',    totalCards);
  setEuro('r-rev-min',    revMin);
  setEuro('r-rev-max',    revMax);
  setProfit('r-profit-min', profitMin);
  setProfit('r-profit-max', profitMax);

  // Breakdown note
  const limitingFactor = cocktailFromAlcohol < cocktailFromSoda
    ? `alcohol (you could use ${fmt(cocktailFromSoda - alcoholL * 5 / 5)} L more soda)`
    : `soda (you could use ${fmt(cocktailFromAlcohol - cocktailL)} L more alcohol)`;

  document.getElementById('r-breakdown').innerHTML = `
    <strong style="color:var(--gray900);">Breakdown</strong><br>
    Beer cards: ${beerCards} × 2 L = ${fmt(beerCards * 2)} L beer used
      (of ${fmt(beerL)} L available)<br>
    Cocktail mix available: ${fmt(cocktailL)} L
      &nbsp;·&nbsp; limiting factor: ${limitingFactor}<br>
    Cocktail cards: ${cocktailCards} × 0.6 L = ${fmt(cocktailCards * 0.6)} L used
      (of ${fmt(cocktailL)} L available)<br>
    Total alcohol used in cocktails: ${fmt(cocktailCards * 0.6 * 0.2)} L
    &nbsp;·&nbsp; soda: ${fmt(cocktailCards * 0.6 * 0.8)} L
  `;

  resultsEl.style.display = '';
}

// ── Helpers ───────────────────────────────────────────────
function setText(id, val) {
  document.getElementById(id).textContent = val;
}

function setEuro(id, val) {
  const el = document.getElementById(id);
  el.textContent = `€ ${val.toFixed(2)}`;
  el.className = 'calc-result__value';
}

function setProfit(id, val) {
  const el = document.getElementById(id);
  el.textContent = `€ ${val.toFixed(2)}`;
  el.className = `calc-result__value ${val >= 0 ? 'positive' : 'negative'}`;
}

function fmt(n) {
  return Number(n.toFixed(2)).toString();
}
