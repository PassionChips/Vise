//! Turns the text of a CSV file into rows of cells, whatever its delimiter,
//! and finds where the real table starts (title lines above it are skipped).

use std::collections::BTreeMap;

use csv::ReaderBuilder;

/// How many leading rows are searched for the header.
const HEADER_SEARCH_ROWS: usize = 20;

pub struct Row {
    /// Line number in the file (1-based), so errors point at what the user sees.
    pub number: usize,
    pub cells: Vec<String>,
}

impl Row {
    /// The cell in column `index`, or "" if there is no such column or cell.
    pub fn cell(&self, index: Option<usize>) -> &str {
        index
            .and_then(|i| self.cells.get(i))
            .map_or("", String::as_str)
    }
}

pub struct Table {
    /// Line number of the header row, if the file has one.
    pub header_row: Option<usize>,
    pub headers: Vec<String>,
    pub rows: Vec<Row>,
    pub blank_rows: usize,
}

impl Table {
    /// Non-blank cells of one column, in file order.
    pub fn column(&self, index: usize) -> Vec<&str> {
        self.rows
            .iter()
            .map(|row| row.cell(Some(index)))
            .filter(|cell| !cell.is_empty())
            .collect()
    }
}

pub fn read_table(content: &str) -> Result<Table, String> {
    let content = content.trim_start_matches('\u{feff}');
    let mut reader = ReaderBuilder::new()
        .delimiter(sniff_delimiter(content))
        .has_headers(false)
        .flexible(true)
        .from_reader(content.as_bytes());

    let mut records = Vec::new();
    let mut blank_rows = 0;
    for record in reader.records() {
        let record = record.map_err(|e| format!("Could not read the file as a table: {e}"))?;
        let cells: Vec<String> = record.iter().map(|c| c.trim().to_string()).collect();
        if cells.iter().all(String::is_empty) {
            blank_rows += 1;
            continue;
        }
        let number = record
            .position()
            .map_or(records.len() + blank_rows + 1, |p| p.line() as usize);
        records.push(Row { number, cells });
    }

    let width = records.iter().map(|r| r.cells.len()).max().unwrap_or(0);
    let header_index = find_header(&records, width);
    let (header_row, headers, rows) = match header_index {
        Some(index) => {
            let mut rows = records;
            let data = rows.split_off(index + 1);
            let header = rows.pop().expect("the header row exists");
            let mut headers = header.cells.clone();
            headers.resize(width, String::new());
            (Some(header.number), headers, data)
        }
        None => (
            None,
            (1..=width).map(|i| format!("Column {i}")).collect(),
            records,
        ),
    };

    Ok(Table {
        header_row,
        headers,
        rows,
        blank_rows,
    })
}

/// Picks the delimiter that splits the first lines into the same number of
/// fields most consistently.
fn sniff_delimiter(content: &str) -> u8 {
    let lines: Vec<&str> = content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .take(10)
        .collect();
    let mut best = (0, b',');
    for candidate in [b',', b';', b'\t', b'|'] {
        let counts: Vec<usize> = lines
            .iter()
            .map(|l| l.matches(candidate as char).count())
            .collect();
        let mut tally = BTreeMap::new();
        for &count in counts.iter().filter(|&&c| c > 0) {
            *tally.entry(count).or_insert(0usize) += 1;
        }
        let Some((&mode, &hits)) = tally.iter().max_by_key(|&(count, hits)| (*hits, *count)) else {
            continue;
        };
        let score = hits * 1000 + mode;
        if score > best.0 {
            best = (score, candidate);
        }
    }
    best.1
}

/// Numbers and dates; header cells are words.
fn looks_like_data(cell: &str) -> bool {
    let visible = cell.chars().filter(|c| !c.is_whitespace()).count();
    let digits = cell.chars().filter(char::is_ascii_digit).count();
    digits > 0 && digits * 2 >= visible
}

/// The first row that is mostly words, nearly as wide as the table, and
/// followed by a row containing numbers or dates.
fn find_header(records: &[Row], width: usize) -> Option<usize> {
    let min_cells = 2.max(width.div_ceil(2));
    records
        .iter()
        .take(HEADER_SEARCH_ROWS)
        .enumerate()
        .find(|&(index, row)| {
            let filled: Vec<&String> = row.cells.iter().filter(|c| !c.is_empty()).collect();
            let words = filled.iter().filter(|c| !looks_like_data(c)).count();
            filled.len() >= min_cells
                && words * 10 >= filled.len() * 7
                && records
                    .get(index + 1)
                    .is_none_or(|next| next.cells.iter().any(|c| looks_like_data(c)))
        })
        .map(|(index, _)| index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_commas_and_semicolons() {
        let comma = read_table("Date,Amount\n2026-09-01,12.50\n").unwrap();
        assert_eq!(comma.headers, ["Date", "Amount"]);
        let semi = read_table("Datum;Betrag\n01.09.2026;12,50\n").unwrap();
        assert_eq!(semi.headers, ["Datum", "Betrag"]);
        assert_eq!(semi.rows[0].cells, ["01.09.2026", "12,50"]);
    }

    #[test]
    fn skips_title_lines_and_reports_the_header_line() {
        let text =
            "My bank statement\n\nAccount 123\nDate,Description,Amount\n2026-09-01,Lunch,12.50\n";
        let table = read_table(text).unwrap();
        assert_eq!(table.header_row, Some(4));
        assert_eq!(table.rows.len(), 1);
        assert_eq!(table.rows[0].number, 5);
    }

    #[test]
    fn a_file_without_a_header_gets_numbered_columns() {
        let table = read_table("2026-09-01,Lunch,12.50\n2026-09-02,Taxi,20.00\n").unwrap();
        assert_eq!(table.header_row, None);
        assert_eq!(table.headers, ["Column 1", "Column 2", "Column 3"]);
        assert_eq!(table.rows.len(), 2);
    }

    #[test]
    fn strips_a_byte_order_mark_and_counts_blank_lines() {
        let table = read_table("\u{feff}Date,Amount\n\n2026-09-01,1\n,\n").unwrap();
        assert_eq!(table.headers[0], "Date");
        // The csv reader drops empty lines itself; only `,` counts as a blank row.
        assert_eq!(table.blank_rows, 1);
        assert_eq!(table.rows.len(), 1);
    }

    #[test]
    fn quoted_fields_may_contain_the_delimiter() {
        let table =
            read_table("Date,Description,Amount\n2026-09-01,\"Shop, Main St\",5.00\n").unwrap();
        assert_eq!(table.rows[0].cells[1], "Shop, Main St");
    }
}
