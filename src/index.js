const fs = require('fs');
const path = require("path");
const helper = require('./helper.js')
const { getParsedUSFM, verseObjectsToString, setBook, getQuoteMatchesInBookRef } = require("uw-quote-helpers");
const { selectionsFromQuoteAndString } = require('@texttree/tn-quote/dist/utils/srrcl.js');

const BOOKPATHS = [
  '01-GEN', '02-EXO', '03-LEV', '04-NUM', '05-DEU',
  '06-JOS', '07-JDG', '08-RUT', '09-1SA', '10-2SA',
  '11-1KI', '12-2KI', '13-1CH', '14-2CH', '15-EZR',
  '16-NEH', '17-EST', '18-JOB', '19-PSA', '20-PRO',
  '21-ECC', '22-SNG', '23-ISA', '24-JER', '25-LAM',
  '26-EZK', '27-DAN', '28-HOS', '29-JOL', '30-AMO',
  '31-OBA', '32-JON', '33-MIC', '34-NAM', '35-HAB',
  '36-ZEP', '37-HAG', '38-ZEC', '39-MAL', '41-MAT',
  '42-MRK', '43-LUK', '44-JHN', '45-ACT', '46-ROM',
  '47-1CO', '48-2CO', '49-GAL', '50-EPH', '51-PHP',
  '52-COL', '53-1TH', '54-2TH', '55-1TI', '56-2TI',
  '57-TIT', '58-PHM', '59-HEB', '60-JAS', '61-1PE',
  '62-2PE', '63-1JN', '64-2JN', '65-3JN', '66-JUD',
  '67-REV'
]
const bookNames = BOOKPATHS.map(el => el.slice(3))
const bookNamesTN = bookNames.map(el => 'tn_' + el + '.tsv')
const bookNamesBible = BOOKPATHS.map(el => el + '.usfm')

const validateBookNames = (path, names, getListBook) => {
  const existingBooks = []

  try {
    const files = fs.readdirSync(path)
    if (!files.length) {
      console.log('folder ' + path + ' is empty')
    }
    for (const fileName of files) {
      if (!names.find(el => el === fileName)) {
        const error = { error: 'file ' + fileName + ' have wrong name' }
        throw error
      }
      if (getListBook) {
        existingBooks.push(fileName)
      }
    }
  } catch (error) {
    console.error(error)
  }
  return existingBooks
}


const validate = ({ getListBook }) => {
  validateBookNames('./mock/tn', bookNamesTN)
  validateBookNames('./mock/books/original', bookNamesBible)
  return validateBookNames('./mock/books/gl', bookNamesBible, getListBook)

}

const getALLBooksTN = (bookPath) => {
  const bookName = bookPath.slice(3, -5)
  const tsvText = fs.readFileSync('./mock/tn/tn_' + bookName + '.tsv', 'utf8');
  const targetUsfm = fs.readFileSync(
    path.join(__dirname, '../mock/books/gl/' + bookPath),
    "utf8"
  );
  const sourceUsfm = fs.readFileSync(
    path.join(__dirname, '../mock/books/original/' + bookPath),
    "utf8"
  );

  const sourceBook = getParsedUSFM(sourceUsfm).chapters;
  const targetBook = getParsedUSFM(targetUsfm).chapters;

  const getOLQuote = (quote, chapter, verse, sourceBook, targetBook) => {
    const ref = chapter + ':' + verse
    const verseOriginal = setBook(sourceBook, ref)
    const verseTarget = setBook(targetBook, ref)

    const verseObjectsOriginal = verseOriginal.verses[0].verseData?.verseObjects


    const verseObjectsTarget = verseTarget.verses[0].verseData?.verseObjects

    const flatten = helper.flattenVerseObjects({ verseObjects: verseObjectsTarget }).filter(el => el.content)

    // 1 этап - вытягиваю весь стих в строку

    const verseObjectsTargetString = verseObjectsToString(verseObjectsTarget || [])
    const verseObjectsOriginalString = verseObjectsToString(verseObjectsOriginal || [])

    //2 этап - ищу в этом стихе цитату

    const greekSelections = []
    if (verseObjectsTargetString.includes(quote)) {

      //3 этап - если есть совпадение - тогда ищу в этой цитате occurrence и occurrences

      const wordsTargetObjects = selectionsFromQuoteAndString({ string: verseObjectsTargetString, occurrence: 1, quote })

      // 4 этап  - ищу совпадения найденных слов во всем массиве стихов

      for (const item of flatten) {
        for (const word of item.words) {
          if (wordsTargetObjects.map(el => JSON.stringify(el)).includes(JSON.stringify(word))) {
            const content = item.content
            greekSelections.push(content.map(el => ({ ...el, reference: { chapter, verse } })))
            break
          }
        }
      }
    }

    //5 этам - выравниваем полученный массив

    const quoteString = greekSelections.flat().map(el => el.text).join(' ')
    console.log(quoteString)
    //6 этап - ищем совпадения по оригинальному языку
    /* Это функция Абеля - похоже выдаёт правильный порядок - возвращает Map*/

    const occ = getQuoteMatchesInBookRef({
      quote: quoteString,
      ref,
      bookObject: sourceBook,
      isOrigLang: true,
      occurrence: -1,
    })
    const result = occ.get(ref)
    /*7 этап - возвращаем результат, который будет записываться в tsv.
    Если результат успешный - то его пишем, если нет - пишем ~ - потому что есть необработанная Абелевским скриптом фраза, а есть отсутсвие этой фразы, может пригодится*/
    return result ? result?.map(el => el.text).join(' ') : '~' + quoteString
  }

  const tsvRows = tsvText.split('\n').map((el) => el.split('\t'));
  tsvRows[0].splice(5, 0, 'OrigQuote')
  let result = [tsvRows[0].join('\t')]
  let success = 0
  let errors = 0

  for (let i = 1; i < tsvRows.length; i++) {
    const Reference = tsvRows[i][0]
    const Quote = tsvRows[i][4]
    const [chapter, verse] = Reference.split(':')
    if (verse === 'intro') {
      result.push([tsvRows[i][0], tsvRows[i][1], tsvRows[i][2], tsvRows[i][3], tsvRows[i][4], '', tsvRows[i][5], tsvRows[i][6]].join('\t'))
      continue
    }
    const origQuote = getOLQuote(Quote, chapter, verse, sourceBook, targetBook)
    if (!origQuote.includes('~')) {
      success++
    } else { errors++ }
    result.push([tsvRows[i][0], tsvRows[i][1], tsvRows[i][2], tsvRows[i][3], tsvRows[i][4], origQuote, tsvRows[i][5], tsvRows[i][6]].join('\t'))
  }
  const resultMessage = bookName + ':' + 'success:' + success + ' ' + 'errors:' + errors + ' ' + 'all:' + (success + errors) + ' ' + 'persent:' + Math.round(success / (success + errors) * 100) + '%' + '\n'
  console.log(resultMessage)
  fs.writeFileSync(
    'result.txt',
    '',
    'utf8'
  );
  fs.appendFile('result.txt', resultMessage, function (err) {
    if (err) throw err;
    console.log('Saved!');
  });
  fs.writeFileSync(
    './result/tn_' + bookName + '.tsv',

    result.join('\n'),
    'utf8'
  );
}

const existingBooks = validate({ getListBook: true })

// const short = existingBooks.slice(0, 1)
for (const bookPath of existingBooks) {
  getALLBooksTN(bookPath)
}









