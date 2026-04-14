const { getCompany, setApiKey } = require("earningscall");

// Use the starter key provided in the code
const API_KEY = "starter_BUnTmpN9CHwnWlhy6Zokqx";
setApiKey(API_KEY);

async function testTicker(symbol) {
  console.log(`\nTesting ticker: ${symbol}...`);
  try {
    const company = await getCompany({ symbol });
    if (company && company.companyInfo) {
      console.log(`  [SUCCESS] Found: ${company.companyInfo.name} (${company.companyInfo.symbol})`);
      const events = await company.events();
      console.log(`  [SUCCESS] Found ${events.length} events.`);
      if (events.length > 0) {
          console.log(`  [SUCCESS] Latest event: Q${events[0].quarter} ${events[0].year}`);
      }
    } else {
      console.log(`  [FAILED] Ticker ${symbol} not found.`);
    }
  } catch (e) {
    console.log(`  [ERROR] Error for ${symbol}: ${e.message}`);
  }
}

async function run() {
  await testTicker("AAPL");   // Control
  await testTicker("META");   // Fixed previously
  await testTicker("MC.PA");  // LVMH (Paris)
  await testTicker("1913.HK");// Prada (Hong Kong)
  await testTicker("PRDSY");  // Prada ADR
  await testTicker("OR.PA");  // L'Oreal (Paris)
}

run();
