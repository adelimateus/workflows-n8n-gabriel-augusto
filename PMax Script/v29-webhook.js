// v29-webhook (free - does not include support)
// Variant of v28 that sends report data to a webhook instead of Google Sheets.
// Each report is POSTed as JSON. Large reports are split into batches.
//
// Setup:
//   1. Set WEBHOOK_URL below to your endpoint (e.g. n8n, Make, Zapier, custom API)
//   2. Authorize and run the script
//   3. Schedule to run daily
//
// Payload format per request:
//   {
//     "report":      "r_camp",          // report name (matches original sheet tab names)
//     "account_id":  "123-456-7890",    // Google Ads account customer ID
//     "timestamp":   "2026-04-29T...",  // ISO 8601 UTC
//     "batch":       1,                 // current batch number (1-based)
//     "total_batches": 2,               // total number of batches for this report
//     "total_rows":  1200,              // total row count for the report
//     "rows": [ { ...row data... } ]    // array of row objects
//   }
//
// Field verification against Google Ads API v23 (January 2026):
// - segments.ad_network_type: returns real channel breakdown for PMax
//   (Search/YouTube/Display/Gmail/Maps/Discover). Data from June 1, 2025 onward.
// - asset_group_asset.performance_label: DEPRECATED since June 5, 2025.

const WEBHOOK_URL = '';   // <-- paste your webhook URL here
const BATCH_SIZE  = 500;  // rows per POST request — lower if you hit payload size limits

function main() {
  if (!WEBHOOK_URL) {
    throw new Error('WEBHOOK_URL is empty. Set it at the top of the script before running.');
  }

  let zombieDays = 366;  // days of data for zombie (0-click) products
  let prodDays   = 181;  // days of data for long-range product analysis



// don't change any code below this line ——————————————————————————————————————————————————————————————————————————————



  // define query elements. wrap with spaces for safety
  let impr        = ' metrics.impressions ';
  let clicks      = ' metrics.clicks ';
  let cost        = ' metrics.cost_micros ';
  let conv        = ' metrics.conversions ';
  let value       = ' metrics.conversions_value ';
  let allConv     = ' metrics.all_conversions ';
  let allValue    = ' metrics.all_conversions_value ';
  let views       = ' metrics.video_views ';
  let cpv         = ' metrics.average_cpv ';
  let segDate     = ' segments.date ';
  let prodTitle   = ' segments.product_title ';
  let prodID      = ' segments.product_item_id ';
  let prodC0      = ' segments.product_custom_attribute0 ';
  let prodC1      = ' segments.product_custom_attribute1 ';
  let prodC2      = ' segments.product_custom_attribute2 ';
  let prodC3      = ' segments.product_custom_attribute3 ';
  let prodC4      = ' segments.product_custom_attribute4 ';
  let campName    = ' campaign.name ';
  let chType      = ' campaign.advertising_channel_type ';
  let adgName     = ' ad_group.name ';
  let adStatus    = ' ad_group_ad.status ';
  let adPerf      = ' ad_group_ad_asset_view.performance_label ';
  let adType      = ' ad_group_ad_asset_view.field_type ';
  let aIdAsset    = ' asset.resource_name ';
  let aId         = ' asset.id ';
  let assetType   = ' asset.type ';
  let aFinalUrl   = ' asset.final_urls ';
  let assetName   = ' asset.name ';
  let assetText   = ' asset.text_asset.text ';
  let assetSource = ' asset.source ';
  let adUrl       = ' asset.image_asset.full_size.url ';
  let ytTitle     = ' asset.youtube_video_asset.youtube_video_title ';
  let ytId        = ' asset.youtube_video_asset.youtube_video_id ';
  let agId        = ' asset_group.id ';
  let assetFtype  = ' asset_group_asset.field_type ';
  let adPmaxPerf  = ' asset_group_asset.performance_label '; // DEPRECATED since June 5, 2025 — use per-asset metrics instead
  let agStrength  = ' asset_group.ad_strength ';
  let agStatus    = ' asset_group.status ';
  let asgName     = ' asset_group.name ';
  let lgType      = ' asset_group_listing_group_filter.type ';
  let aIdCamp     = ' segments.asset_interaction_target.asset ';
  let interAsset  = ' segments.asset_interaction_target.interaction_on_this_asset ';
  let adNetType   = ' segments.ad_network_type '; // API v23: real PMax channel breakdown
  let pMaxOnly    = ' AND campaign.advertising_channel_type = "PERFORMANCE_MAX" ';
  let searchOnly  = ' AND campaign.advertising_channel_type = "SEARCH" ';
  let agFilter    = ' AND asset_group_listing_group_filter.type != "SUBDIVISION" ';
  let adgEnabled  = ' AND ad_group.status = "ENABLED" AND campaign.status = "ENABLED" AND ad_group_ad.status = "ENABLED" ';
  let asgEnabled  = ' asset_group.status = "ENABLED" AND campaign.status = "ENABLED" ';
  let notInter    = ' AND segments.asset_interaction_target.interaction_on_this_asset != "TRUE" ';
  let inter       = ' AND segments.asset_interaction_target.interaction_on_this_asset = "TRUE" ';
  let date07      = ' segments.date DURING LAST_7_DAYS ';
  let date30      = ' segments.date DURING LAST_30_DAYS ';
  let order       = ' ORDER BY campaign.name ';
  let orderImpr   = ' ORDER BY metrics.impressions DESC ';


  // date stuff
  let MILLIS_PER_DAY = 1000 * 60 * 60 * 24;
  let now     = new Date();
  let from    = new Date(now.getTime() - zombieDays * MILLIS_PER_DAY);
  let prod180 = new Date(now.getTime() - prodDays   * MILLIS_PER_DAY);
  let to      = new Date(now.getTime() - 1          * MILLIS_PER_DAY);
  let timeZone    = AdsApp.currentAccount().getTimeZone();
  let zombieRange = ' segments.date BETWEEN "' + Utilities.formatDate(from,    timeZone, 'yyyy-MM-dd') + '" AND "' + Utilities.formatDate(to, timeZone, 'yyyy-MM-dd') + '"';
  let prodDate    = ' segments.date BETWEEN "' + Utilities.formatDate(prod180, timeZone, 'yyyy-MM-dd') + '" AND "' + Utilities.formatDate(to, timeZone, 'yyyy-MM-dd') + '"';


  // build queries
  let cd = [segDate, campName, cost, conv, value, views, cpv, impr, clicks, chType, adNetType];
  let campQuery = 'SELECT ' + cd.join(',') +
      ' FROM campaign WHERE ' + date30 + pMaxOnly + order;

  let dv = [segDate, campName, aIdCamp, cost, conv, value, views, cpv, impr, chType, interAsset];
  let dvQuery = 'SELECT ' + dv.join(',') +
      ' FROM campaign WHERE ' + date30 + pMaxOnly + notInter + order;

  let p = [campName, prodTitle, cost, conv, value, impr, chType, prodID, prodC0, prodC1, prodC2, prodC3, prodC4];
  let pQuery    = 'SELECT ' + p.join(',') + ' FROM shopping_performance_view WHERE ' + date30    + pMaxOnly + order;
  let p180Query = 'SELECT ' + p.join(',') + ' FROM shopping_performance_view WHERE ' + prodDate  + pMaxOnly + order;

  let ag = [segDate, campName, asgName, agStrength, agStatus, lgType, impr, clicks, cost, conv, value];
  let agQuery = 'SELECT ' + ag.join(',') +
      ' FROM asset_group_product_group_view WHERE ' + date30 + agFilter;

  let assets = [aId, aFinalUrl, assetSource, assetType, ytTitle, ytId, assetText, aIdAsset, assetName];
  let assetQuery = 'SELECT ' + assets.join(',') + ' FROM asset';

  let ads = [campName, asgName, agId, aIdAsset, assetFtype, adPmaxPerf, agStrength, agStatus, assetSource];
  let adsQuery = 'SELECT ' + ads.join(',') + ' FROM asset_group_asset';

  let zombies = [prodID, clicks, impr, prodTitle];
  let zQuery = 'SELECT ' + zombies.join(',') +
      ' FROM shopping_performance_view WHERE metrics.clicks < 1 AND ' + zombieRange + orderImpr;


  // run all reports and send to webhook
  sendReport(campQuery,  'r_camp');
  sendReport(dvQuery,    'r_dv');
  sendReport(pQuery,     'r_prod_t');
  sendReport(p180Query,  'r_prod_t_180');
  sendReport(agQuery,    'r_ag');
  sendReport(assetQuery, 'r_allads');
  sendReport(adsQuery,   'r_ads');
  sendReport(zQuery,     'zombies');

} // end main



// execute query, collect all rows, POST to webhook in batches
function sendReport(query, reportName) {
  let accountId = AdsApp.currentAccount().getCustomerId();
  let timestamp = new Date().toISOString();

  let report = AdsApp.report(query);
  let iterator = report.rows();
  let allRows = [];

  while (iterator.hasNext()) {
    allRows.push(iterator.next());
  }

  let totalRows   = allRows.length;
  let totalBatches = Math.ceil(totalRows / BATCH_SIZE) || 1; // at least 1 batch (empty report)

  for (let b = 0; b < totalBatches; b++) {
    let batchRows = allRows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);

    let payload = JSON.stringify({
      report:        reportName,
      account_id:    accountId,
      timestamp:     timestamp,
      batch:         b + 1,
      total_batches: totalBatches,
      total_rows:    totalRows,
      rows:          batchRows
    });

    let options = {
      method:           'POST',
      contentType:      'application/json',
      payload:          payload,
      muteHttpExceptions: true
    };

    let response = UrlFetchApp.fetch(WEBHOOK_URL, options);
    let status   = response.getResponseCode();

    if (status < 200 || status >= 300) {
      Logger.log('ERROR sending ' + reportName + ' batch ' + (b + 1) + '/' + totalBatches +
                 ' — HTTP ' + status + ': ' + response.getContentText());
    } else {
      Logger.log('OK ' + reportName + ' batch ' + (b + 1) + '/' + totalBatches +
                 ' (' + batchRows.length + ' rows)');
    }
  }
}
