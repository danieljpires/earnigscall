const yahooFinance = require('yahoo-finance2').default;

async function checkIndustries() {
  try {
    // In v2, you can use the default export directly for simple calls
    const adbe = await yahooFinance.quoteSummary('ADBE', { modules: ['assetProfile'] });
    const adsk = await yahooFinance.quoteSummary('ADSK', { modules: ['assetProfile'] });

    if (adbe.assetProfile) {
      console.log('ADBE:', adbe.assetProfile.sector, '/', adbe.assetProfile.industry);
    }
    if (adsk.assetProfile) {
      console.log('ADSK:', adsk.assetProfile.sector, '/', adsk.assetProfile.industry);
    }
  } catch (e) {
    console.error('Error fetching data:', e.message);
  }
}

checkIndustries();
