// Force sentry DSN into environment variables
// In the future, will be set by the stack
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  "https://1bdc9628c1724cb899ce99bb547efd19:6bd1ecd2e64e42558499c9b2a5d1a0e7@sentry.cozycloud.cc/17";

const PDFParser = require("pdf2json");
const pdfBillsHelper = require("./pdfBillsHelper.js");

const { BaseKonnector, log } = require("cozy-konnector-libs");

const connector = new BaseKonnector(start);

function start(fields) {
  return connector
    .logIn(fields)
    .then(connector.fetchTimetablePdf)
    .then(fileName => connector.pdfToJson(fileName))
    .then(json => connector.extractBills(json))
    .then(bills => connector.showBills(bills));
}

connector.logIn = function(fields) {
  return new Promise(function(resolve) {
    log("info", "Logging in not implemented yet");
    log("info", "Login = " + fields.login);
    log("info", "Password = " + fields.password);
    resolve();
  });
};

connector.fetchTimetablePdf = function() {
  return new Promise(function(resolve) {
    log("info", "Returning PDF Timetable");
    const fileName = "./input/avis-echeance.pdf";
    resolve(fileName);
  });
};

connector.pdfToJson = function(fileName) {
  return new Promise(function(resolve) {
    let pdfParser = new PDFParser();

    pdfParser.on("pdfParser_dataError", errData => {
      log("error", "PDFParser error : " + errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", pdfData => {
      resolve(pdfData);
    });

    pdfParser.loadPDF(fileName);
  });
};

connector.extractBills = function(json) {
  return new Promise(function(resolve) {
    log("info", "Extracting Bills !");

    const bills = pdfBillsHelper.getBills(json);

    log("info", "Extracting Bills Finished ! " + bills.length + " found !");

    resolve(bills);
  });
};

connector.showBills = function(bills) {
  for (var idx in bills) {
    log(
      "info",
      "Bill : " +
        bills[idx].date.format("YYYY-MM-DD") +
        " --> " +
        bills[idx].amount
    );
  }
};

module.exports = connector;
