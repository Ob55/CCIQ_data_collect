// Fixture XLSForm workbooks (PRD §11): a simple form, groups, a repeat, multi-language,
// and deliberately broken ones. Builders return in-memory SheetJS workbooks so tests run
// fast; scripts/build-fixtures.mjs writes them to .xlsx for manual inspection.
import * as XLSX from 'xlsx'

function workbook(sheets) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return wb
}

const YES_NO = [
  ['list_name', 'name', 'label'],
  ['yes_no', 'yes', 'Yes'],
  ['yes_no', 'no', 'No'],
]

export const fixtures = {
  // 1) Simple form: text, integer, select_one, note.
  simple: () =>
    workbook({
      survey: [
        ['type', 'name', 'label', 'hint', 'required'],
        ['text', 'full_name', 'What is your name?', '', 'yes'],
        ['integer', 'age', 'Age in years', 'Whole number', ''],
        ['select_one yes_no', 'owns_stove', 'Do you own a stove?', '', 'yes'],
        ['note', 'thanks', 'Thank you for participating', '', ''],
      ],
      choices: YES_NO,
      settings: [
        ['form_title', 'form_id', 'version'],
        ['Simple Form', 'simple', '2026013001'],
      ],
    }),

  // 2) Groups with skip logic (relevant).
  groups: () =>
    workbook({
      survey: [
        ['type', 'name', 'label', 'relevant'],
        ['select_one yes_no', 'cooks', 'Do you cook at home?', ''],
        ['begin_group', 'cooking', 'Cooking details', "selected(${cooks}, 'yes')"],
        ['integer', 'meals', 'Meals cooked per day', ''],
        ['text', 'fuel', 'Primary cooking fuel', ''],
        ['end_group', '', '', ''],
      ],
      choices: YES_NO,
      settings: [
        ['form_title', 'form_id', 'version'],
        ['Grouped Form', 'grouped', '1'],
      ],
    }),

  // 3) Repeat group.
  repeat: () =>
    workbook({
      survey: [
        ['type', 'name', 'label', 'constraint'],
        ['text', 'household_id', 'Household ID', ''],
        ['begin_repeat', 'members', 'Household member'],
        ['text', 'member_name', 'Member name', ''],
        // "." is the current field's value — the standard XLSForm constraint idiom.
        ['integer', 'member_age', 'Member age', '. >= 0 and . <= 120'],
        ['end_repeat', '', '', ''],
      ],
      settings: [
        ['form_title', 'form_id', 'version'],
        ['Repeat Form', 'repeat', '1'],
      ],
    }),

  // 4) Multi-language labels.
  multilang: () =>
    workbook({
      survey: [
        ['type', 'name', 'label::English (en)', 'label::Kiswahili (sw)'],
        ['text', 'full_name', 'Name', 'Jina'],
        ['integer', 'age', 'Age', 'Umri'],
        ['select_one yes_no', 'owns_stove', 'Owns a stove?', 'Una jiko?'],
      ],
      choices: [
        ['list_name', 'name', 'label::English (en)', 'label::Kiswahili (sw)'],
        ['yes_no', 'yes', 'Yes', 'Ndiyo'],
        ['yes_no', 'no', 'No', 'Hapana'],
      ],
      settings: [
        ['form_title', 'form_id', 'default_language'],
        ['Multilang Form', 'multilang', 'English (en)'],
      ],
    }),

  // 5) BROKEN: unsupported question type on row 3.
  brokenType: () =>
    workbook({
      survey: [
        ['type', 'name', 'label'],
        ['text', 'full_name', 'Name'],
        ['barcode', 'code', 'Scan the barcode'],
      ],
    }),

  // 6) BROKEN: invalid relevant expression on row 3.
  brokenExpr: () =>
    workbook({
      survey: [
        ['type', 'name', 'label', 'relevant'],
        ['integer', 'age', 'Age', ''],
        ['text', 'adult_name', 'Adult name', '${age} >'],
      ],
    }),

  // 7) BROKEN: a begin_group that is never closed.
  brokenUnclosed: () =>
    workbook({
      survey: [
        ['type', 'name', 'label'],
        ['begin_group', 'section', 'Section A'],
        ['text', 'q1', 'Question 1'],
      ],
    }),

  // BROKEN: select_one referencing a list that is absent from the choices sheet.
  brokenMissingList: () =>
    workbook({
      survey: [
        ['type', 'name', 'label'],
        ['select_one nonexistent', 'q', 'Pick one'],
      ],
      choices: YES_NO,
    }),

  // BROKEN: no survey sheet at all.
  brokenNoSurvey: () =>
    workbook({
      settings: [
        ['form_title', 'form_id'],
        ['No Survey', 'nosurvey'],
      ],
    }),
}
