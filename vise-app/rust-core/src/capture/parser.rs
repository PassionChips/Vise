//! Reads the text of a payment notification: was money paid or received, how much, to or from whom.
//!
//! Notification wording is not a contract. Apps change it between versions and by language, so this reads
//! the *meaning* (a direction word, an amount next to a currency, a name after "to" / "from" / "at") rather than
//! matching one fixed template per app. A notification that has an amount but whose direction is not clear is
//! reported as `Unclear` so the user can finish it, never guessed. Anything that is not a completed payment
//! (a request, a reminder, an offer, a failure) is `Ignored`.

use crate::importer::amounts::{guess_decimal, parse_signed_cents};

use super::apps::PaymentApp;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Expense,
    Income,
}

impl Direction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Expense => "expense",
            Self::Income => "income",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    pub direction: Direction,
    pub amount_cents: i64,
    /// `None` for a bare `$`, which could be any dollar currency; the user's own currency fills it in.
    pub currency: Option<String>,
    pub merchant: Option<String>,
    pub reference: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Outcome {
    Payment(Parsed),
    /// Has an amount, but it is not clear which way the money went.
    Unclear,
    /// Not a completed payment.
    Ignored,
}

// ----- Words -----

/// If any of these appears, the notification is not a completed payment.
const NOT_A_PAYMENT: [&str; 31] = [
    "request",
    "reminder",
    "due on",
    "due by",
    "is due",
    "failed",
    "declined",
    "unsuccessful",
    "could not",
    "couldn't",
    "cancelled",
    "canceled",
    "pending",
    "scratch",
    "reward",
    "cashback",
    "offer",
    "get up to",
    "earn ",
    "% off",
    "claim",
    "invite",
    "otp",
    "verification",
    "security code",
    "statement is ready",
    "expires",
    "limited time",
    "win ",
    "refund initiated",
    "refund will",
];

const INCOME_WORDS: [&str; 11] = [
    "paid you",
    "sent you",
    "received",
    "credited",
    "added to your",
    "refunded",
    "refund of",
    "you got",
    "deposited",
    "money in",
    "transferred you",
];

const EXPENSE_WORDS: [&str; 13] = [
    "you paid",
    "paid ",
    "payment to",
    "payment of",
    "payment for",
    "you sent",
    "sent ",
    "spent",
    "debited",
    "purchase",
    "card payment",
    "transfer to",
    "transferred to",
];

/// Titles that name the app or the kind of event, not a merchant.
const GENERIC_TITLES: [&str; 20] = [
    "revolut",
    "paypal",
    "phonepe",
    "google pay",
    "gpay",
    "paytm",
    "wise",
    "venmo",
    "cash app",
    "payment",
    "payments",
    "card payment",
    "money received",
    "money sent",
    "transfer",
    "transaction",
    "payment successful",
    "payment received",
    "you paid",
    "you sent",
];

/// Where a name after "to" / "from" / "at" stops.
const NAME_STOPS: [&str; 18] = [
    " using ",
    " via ",
    " from your",
    " from a/c",
    " from account",
    " on ",
    " with ",
    " was ",
    " has ",
    " is ",
    " successfully",
    " upi",
    " ref",
    " for ",
    " through ",
    " in your",
    " to your",
    " before ",
];

/// Words that mean an amount nearby is a balance, not the payment.
const BALANCE_WORDS: [&str; 5] = ["balance", "bal ", "bal:", "available", "limit"];

// ----- Amounts -----

#[derive(Debug, PartialEq)]
struct Money {
    cents: i64,
    currency: Option<String>,
    /// Byte offset in the text, to look at the words before it.
    start: usize,
}

/// A currency written before or after a number: `₹250`, `Rs. 250`, `INR 250.00`, `$25.00 USD`, `4,50 €`.
fn marker_currency(marker: &str) -> Option<Option<String>> {
    let text = marker.trim_matches(|c: char| c == '.' || c.is_whitespace());
    match text.to_ascii_lowercase().as_str() {
        "₹" | "rs" | "inr" => Some(Some("INR".into())),
        "€" | "eur" => Some(Some("EUR".into())),
        "£" | "gbp" => Some(Some("GBP".into())),
        "usd" => Some(Some("USD".into())),
        "cad" => Some(Some("CAD".into())),
        "aud" => Some(Some("AUD".into())),
        "chf" => Some(Some("CHF".into())),
        "aed" => Some(Some("AED".into())),
        "$" => Some(None),
        _ => None,
    }
}

/// The digits, commas and dots starting at `from`, without a trailing sentence dot or comma.
fn number_at(text: &str, from: usize) -> Option<(&str, usize)> {
    let rest = &text[from..];
    let end = rest
        .char_indices()
        .find(|(_, c)| !(c.is_ascii_digit() || *c == ',' || *c == '.'))
        .map_or(rest.len(), |(i, _)| i);
    let token = rest[..end].trim_end_matches(['.', ',']);
    (token.chars().any(|c| c.is_ascii_digit())
        && token.chars().next().is_some_and(|c| c.is_ascii_digit()))
    .then_some((token, from + token.len()))
}

fn parse_token(token: &str) -> Option<i64> {
    let decimal = guess_decimal(&[token]).decimal;
    parse_signed_cents(token, decimal)
        .ok()
        .flatten()
        .filter(|c| *c > 0)
}

/// Every amount that sits next to a currency, in reading order.
fn scan_money(text: &str) -> Vec<Money> {
    let mut found: Vec<Money> = Vec::new();
    let bytes: Vec<(usize, char)> = text.char_indices().collect();
    let mut i = 0;
    while i < bytes.len() {
        let (pos, c) = bytes[i];
        // A marker first: a symbol, or a word such as Rs / INR.
        let marker_end = if matches!(c, '₹' | '€' | '£' | '$') {
            Some(pos + c.len_utf8())
        } else if c.is_ascii_alphabetic()
            && (pos == 0
                || !text[..pos]
                    .chars()
                    .next_back()
                    .is_some_and(|p| p.is_ascii_alphabetic()))
        {
            let word_end = text[pos..]
                .find(|ch: char| !ch.is_ascii_alphabetic())
                .map_or(text.len(), |n| pos + n);
            let word = &text[pos..word_end];
            marker_currency(word).map(|_| {
                if text[word_end..].starts_with('.') {
                    word_end + 1
                } else {
                    word_end
                }
            })
        } else {
            None
        };
        if let Some(end) = marker_end {
            let marker = text[pos..end].to_string();
            let after = end + text[end..].len() - text[end..].trim_start().len();
            if let (Some(currency), Some((token, number_end))) =
                (marker_currency(&marker), number_at(text, after))
                && let Some(cents) = parse_token(token)
            {
                // `$25.00 USD`: a code right after the number says which dollar.
                let currency = currency.or_else(|| {
                    let code: String = text[number_end..]
                        .trim_start()
                        .chars()
                        .take_while(char::is_ascii_alphabetic)
                        .collect();
                    marker_currency(&code).flatten()
                });
                found.push(Money {
                    cents,
                    currency,
                    start: pos,
                });
            }
        } else if c.is_ascii_digit()
            && (pos == 0
                || !text[..pos].ends_with(|p: char| p.is_ascii_digit() || p == ',' || p == '.'))
        {
            // A number first, then a currency after it: `250 INR`, `4,50 €`.
            if let Some((token, end)) = number_at(text, pos) {
                let rest = text[end..].trim_start();
                let marker: String = rest
                    .chars()
                    .take_while(|ch| {
                        ch.is_ascii_alphabetic() || matches!(ch, '₹' | '€' | '£' | '$')
                    })
                    .collect();
                let already_counted = found
                    .last()
                    .is_some_and(|m| m.start < pos && pos - m.start <= 6);
                if !marker.is_empty()
                    && !already_counted
                    && let (Some(currency), Some(cents)) =
                        (marker_currency(&marker), parse_token(token))
                {
                    found.push(Money {
                        cents,
                        currency,
                        start: pos,
                    });
                }
            }
        }
        i += 1;
    }
    found
}

/// The payment amount: the first amount that is not a balance.
fn find_amount(text: &str) -> Option<Money> {
    let lower = text.to_lowercase();
    scan_money(text).into_iter().find(|money| {
        let before = &lower[..money.start.min(lower.len())];
        let window = before
            .chars()
            .rev()
            .take(14)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>();
        !BALANCE_WORDS.iter().any(|w| window.contains(w))
    })
}

// ----- Merchant and reference -----

fn clean_name(raw: &str) -> Option<String> {
    let mut end = raw.len();
    let lower = raw.to_lowercase();
    for stop in NAME_STOPS {
        if let Some(i) = lower.find(stop) {
            end = end.min(i);
        }
    }
    for stop in ['.', '|', '•', '(', '!', ',', '\n', '·'] {
        if let Some(i) = raw.find(stop) {
            // A dot inside an address or domain (`name@bank`, `netflix.com`) is part of the name.
            let inside = stop == '.'
                && raw[i + 1..]
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_alphanumeric());
            if !inside {
                end = end.min(i);
            }
        }
    }
    let name = raw[..end]
        .trim()
        .trim_matches(|c: char| c == '"' || c == '\'' || c == ':' || c == '-' || c.is_whitespace());
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = name.to_lowercase();
    let usable = name.chars().filter(|c| c.is_alphabetic()).count() >= 2
        && name.chars().count() <= 60
        && !lower.starts_with("you")
        && !lower.starts_with("your")
        && !lower.starts_with("a/c")
        && marker_currency(&name).is_none();
    usable.then_some(name)
}

/// The text after the first ` to ` / ` from ` / ` at ` that is followed by a usable name.
fn name_after(text: &str, keywords: &[&str]) -> Option<String> {
    let lower = text.to_lowercase();
    keywords
        .iter()
        .filter_map(|keyword| {
            let mut from = 0;
            while let Some(i) = lower[from..].find(keyword) {
                let at = from + i + keyword.len();
                if let Some(name) = clean_name(&text[at..]) {
                    return Some((from + i, name));
                }
                from = at;
            }
            None
        })
        .min_by_key(|(position, _)| *position)
        .map(|(_, name)| name)
}

fn title_as_merchant(title: &str) -> Option<String> {
    let name = title.trim();
    let lower = name.to_lowercase();
    let generic = GENERIC_TITLES.contains(&lower.as_str())
        || INCOME_WORDS
            .iter()
            .chain(EXPENSE_WORDS.iter())
            .any(|w| lower.contains(w.trim()))
        || !scan_money(name).is_empty();
    (!generic
        && name.chars().filter(|c| c.is_alphabetic()).count() >= 2
        && name.chars().count() <= 40)
        .then(|| name.to_string())
}

/// A transaction or UPI reference: the 8 to 24 letters and digits after "Ref", "UTR" or "Transaction ID".
fn find_reference(text: &str) -> Option<String> {
    let lower = text.to_lowercase();
    for key in [
        "upi ref",
        "utr",
        "transaction id",
        "txn id",
        "reference",
        "ref no",
        "ref.",
        "ref:",
        "ref ",
    ] {
        let Some(i) = lower.find(key) else { continue };
        let rest = text[i + key.len()..].trim_start_matches(|c: char| !c.is_alphanumeric());
        let token: String = rest
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
        if (8..=24).contains(&token.len())
            && token.chars().filter(char::is_ascii_digit).count() >= 6
        {
            return Some(token.to_uppercase());
        }
    }
    None
}

// ----- Entry point -----

fn direction_of(lower: &str) -> Option<Direction> {
    if INCOME_WORDS.iter().any(|w| lower.contains(w)) {
        Some(Direction::Income)
    } else if EXPENSE_WORDS.iter().any(|w| lower.contains(w)) {
        Some(Direction::Expense)
    } else {
        None
    }
}

/// Reads one notification from `app`.
pub fn parse(_app: PaymentApp, title: &str, body: &str) -> Outcome {
    let full = format!("{} . {}", title.trim(), body.trim());
    let lower = full.to_lowercase();
    if NOT_A_PAYMENT.iter().any(|w| lower.contains(w)) {
        return Outcome::Ignored;
    }
    let Some(money) = find_amount(&full) else {
        return Outcome::Ignored;
    };
    let Some(direction) = direction_of(&lower) else {
        return Outcome::Unclear;
    };

    let keywords: &[&str] = match direction {
        Direction::Expense => &[" to ", " at ", " towards "],
        Direction::Income => &[" from "],
    };
    // The name after "to" / "from" / "at": the body first (it is usually the fuller name), then the title, then a
    // title that is itself a name (Revolut shows the shop as the title).
    let merchant = name_after(&format!(" {}", body.trim()), keywords)
        .or_else(|| name_after(&format!(" {}", title.trim()), keywords))
        .or_else(|| title_as_merchant(title));

    Outcome::Payment(Parsed {
        direction,
        amount_cents: money.cents,
        currency: money.currency,
        merchant,
        reference: find_reference(&full),
    })
}

#[cfg(test)]
mod tests;
