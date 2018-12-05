// Force sentry DSN into environment variables
// In the future, will be set by the stack
process.env.SENTRY_DSN =
  process.env.SENTRY_DSN ||
  'https://f419d710cd9e4e5a972a0bc095ef60ca:827312be6a8b40e8b87db9e168eed4d1@sentry.cozycloud.cc/81'

const pdfBillsHelper = require('./pdfBillsHelper.js')
const moment = require('moment')

const {
  BaseKonnector,
  saveBills,
  saveFiles,
  requestFactory,
  log,
  errors
} = require('cozy-konnector-libs')

let request = requestFactory({
  cheerio: true,
  json: false,
  //debug: true,
  jar: true
})

const connector = new BaseKonnector(start)

function start(fields) {
  return connector
    .initSession(fields)
    .then(connector.logIn)
    .then(connector.getInfos)
    .then(connector.pdfToJson)
    .then(connector.extractBills)
    .then(data => connector.saveBills(data, fields))
}

connector.initSession = function(fields) {
  log('info', 'Init session')
  const baseUrl = 'https://connect.maif.fr'
  return request({
    url: baseUrl + '/connect/s/popup/identification',
    method: 'GET',
    resolveWithFullResponse: true
  }).then(response => {
    const $ = response.body

    let form = {
      j_username: fields.login,
      j_password: fields.password
    }

    const connectUrl =
      baseUrl + $("form[id='j_spring_security_check']").attr('action')
    const inputs = Array.from(
      $("form[id='j_spring_security_check']").find("input[type='hidden']")
    )
    for (var i in inputs) {
      const input = $(inputs[i])
      form[input.attr('name')] = input.attr('value')
    }

    return { connectUrl, form }
  })
}

connector.logIn = function(connectData) {
  log('info', 'Logging in')
  log('secret', 'Data : ' + JSON.stringify(connectData))

  return request({
    url: connectData.connectUrl,
    method: 'POST',
    form: connectData.form,
    resolveWithFullResponse: true
  })
    .catch(err => {
      log('error', err.message)
      throw new Error(errors.VENDOR_DOWN)
    })
    .then(response => {
      const $ = response.body

      if ($('body > .maif-connect').length) {
        log(
          'info',
          $('body > .maif-connect')
            .text()
            .trim()
            .replace(/\t/g, '')
            .replace(/\n/g, ' ')
        )
        throw new Error(errors.LOGIN_FAILED)
      }
    })
}

connector.getInfos = async function() {
  const response = await request({
    url: 'https://www.maif.fr/informationspersonnelles/accueilInfoPerso.action',
    resolveWithFullResponse: true
  })
  const accessToken = response.request.uri.hash.match(
    /#token=(.*)&refreshToken=/
  )[1]
  request = requestFactory({
    cheerio: false,
    json: true,
    jar: true
  })
  const respInfos = await request({
    uri: 'https://espacepersonnel.maif.fr/societaire/api/societaire/me',
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  return [respInfos, accessToken]
}

connector.pdfToJson = function([infos, accessToken]) {
  if (infos.avisEcheance != null) {
    const pdfUrl = `https://espacepersonnel.maif.fr${
      infos.avisEcheance.link
    }&token=${accessToken}`
    return request({ url: pdfUrl, encoding: null }).then(data => {
      return { pdfUrl, data, infos }
    })
  } else {
    const pdfUrl = ''
    const data = []
    log('info', 'Echeancier not available')
    return { pdfUrl, data, infos }
  }
}

connector.extractBills = function({ pdfUrl, data, infos }) {
  if (pdfUrl != '') {
    return pdfBillsHelper.getBills(new Uint8Array(data)).then(extractedData => {
      return { pdfUrl, infos, extractedData }
    })
  } else {
    const extractedData = []
    return { pdfUrl, infos, extractedData }
  }
}

connector.saveBills = function({ pdfUrl, infos, extractedData }, fields) {
  log('debug', 'Creating Bills with !' + pdfUrl)
  const bills = []

  for (var idx in extractedData) {
    bills.push({
      amount: extractedData[idx].amount,
      date: extractedData[idx].date.toDate(),
      fileurl: pdfUrl,
      filename: `Avis_echeance_${extractedData[idx].date.format('YYYY')}.pdf`,
      vendor: 'maif',
      maifdateadhesion: infos.dateAdhesion,
      maiftelephone: extractedData[idx].maiftelephone,
      maifnumsocietaire: infos.numeroSocietaireFormate
    })
  }
  log('debug', `${bills.length} bills found`)
  if (bills.length) {
    return saveBills(bills, fields, { identifiers: ['MAIF'] })
  } else {
    const filename = `Avis_echeance_${moment().format('YYYY')}.pdf`
    return saveFiles([{ fileurl: pdfUrl, filename }], fields, {
      identifiers: ['MAIF']
    })
  }
}

module.exports = connector
