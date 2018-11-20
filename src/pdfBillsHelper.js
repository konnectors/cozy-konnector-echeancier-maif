const moment = require('moment')
const pdfjs = require('pdfjs-dist')
const { log } = require('cozy-konnector-libs')

exports.getBills = async function(pdfUrl) {
  const content = await pdfjs
    .getDocument(pdfUrl)
    .then(doc => doc.getPage(1))
    .then(page => page.getTextContent())

  const result = cleanItems(content.items)
  const maiftelephone = getDataAfterPrefix(result, 'Téléphone : ')
  const amounts = getAmounts(result)
  const dates = getDates(result)
  const annualCell = result.find(doc =>
    doc.content.includes('La totalité de la somme de')
  )
  const releveCompteCell = result.find(
    doc => doc.content === 'RELEVE DE COMPTE'
  )
  if (dates.length) {
    log('info', `Found ${dates.length} monthly bills`)
    return dates.map((dateStr, index) => {
      const date = moment(dateStr, 'D MMMM YYYY', 'fr')
      const amount = parseFloat(amounts[index])
      return {
        maiftelephone,
        date,
        amount
      }
    })
  } else if (annualCell) {
    log('info', `Found 1 annual bill with direct debit`)
    // try to find annual bill
    const cell = result.find(doc =>
      doc.content.includes('La totalité de la somme de')
    )
    if (cell) {
      const parsed = cell.content.match(
        /La.*somme de (.*) € sera.*le (.*) sur votre compte/
      )
      if (parsed) {
        let [amount, date] = parsed.slice(1)
        amount = parseFloat(amount.replace(',', '.'))
        date = moment(date, 'D MMMM YYYY', 'fr')
        return [{ maiftelephone, date, amount }]
      } else return []
    } else return []
  } else if (releveCompteCell) {
    log('info', `Found 1 annual bill without direct debit`)
    const top = Math.round(releveCompteCell.top)
    const amountCell = result.find(
      doc => Math.round(doc.top) === top && doc.content.match(/ €$/)
    )
    const dateCell = result.find(doc => doc.content.match(/^avant le/))
    if (amountCell && dateCell) {
      const date = moment(dateCell.content, 'D MMMM YYYY', 'fr')
      const amount = parseFloat(
        amountCell.content.replace(' €', '').replace(',', '.')
      )
      return [{ maiftelephone, date, amount }]
    } else {
      return []
    }
  } else {
    log('warn', `No bills found in the pdf`)
  }
}

function getDataAfterPrefix(items, prefix) {
  return items
    .filter(item => item.content.startsWith(prefix))
    .map(filteredItem => {
      return filteredItem.content.substring(prefix.length)
    })[0]
}

function cleanItems(items) {
  return items.map(item => ({
    content: item.str,
    height: item.height,
    top: item.transform[5]
  }))
}

function getAmounts(items) {
  return selectTextsByHeader(items, 'Montant en euros')
}

function getDates(items) {
  return selectTextsByHeader(items, 'Date de prélèvement').reduce(
    (memo, item) => {
      if (Number(item)) {
        memo[memo.length - 1] += ` ${item}`
      } else {
        memo.push(item)
      }
      return memo
    },
    []
  )
}

function selectTextsByHeader(items, header) {
  const firstRow = items.filter(item => item.content === header)
  const result = firstRow.map(firstCell => {
    const selectedCells = filterCellsByTop(
      items,
      firstCell.top + firstCell.height + 10,
      firstCell.top - 10
    )
    return selectedCells.slice(1).map(item => item.content)
  })

  return result.length >= 2 ? result[0].concat(result[1]) : []
}

function filterCellsByTop(items, top, bottom) {
  return items.filter(item => item.top <= top && item.top >= bottom)
}
