const moment = require('moment')
const pdfjs = require('pdfjs-dist')

exports.getBills = function(pdfUrl) {
  return pdfjs
    .getDocument(pdfUrl)
    .then(doc => doc.getPage(1))
    .then(page => page.getTextContent())
    .then(content => {
      const result = cleanItems(content.items)
      const maiftelephone = getDataAfterPrefix(result, 'Téléphone : ')
      const amounts = getAmounts(result)
      return getDates(result).map((dateStr, index) => {
        const date = moment(dateStr, 'D MMMM YYYY', 'fr')
        const amount = parseFloat(amounts[index])

        return {
          maiftelephone,
          date,
          amount
        }
      })
    })
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
