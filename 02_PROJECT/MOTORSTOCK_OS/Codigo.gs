function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('MotoStock Colombia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
