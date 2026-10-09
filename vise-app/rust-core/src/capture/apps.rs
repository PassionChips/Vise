//! The payment apps VISE reads notifications from, by Android package name. Bank apps are deliberately not here.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PaymentApp {
    GooglePay,
    PhonePe,
    Revolut,
    PayPal,
    Paytm,
    Wise,
    Venmo,
    CashApp,
}

/// (package, app). Google Pay has two apps: the Indian one and Google Wallet elsewhere.
pub const SUPPORTED_PACKAGES: [(&str, PaymentApp); 9] = [
    (
        "com.google.android.apps.nbu.paisa.user",
        PaymentApp::GooglePay,
    ),
    (
        "com.google.android.apps.walletnfcrel",
        PaymentApp::GooglePay,
    ),
    ("com.phonepe.app", PaymentApp::PhonePe),
    ("com.revolut.revolut", PaymentApp::Revolut),
    ("com.paypal.android.p2pmobile", PaymentApp::PayPal),
    ("net.one97.paytm", PaymentApp::Paytm),
    ("com.transferwise.android", PaymentApp::Wise),
    ("com.venmo", PaymentApp::Venmo),
    ("com.squareup.cash", PaymentApp::CashApp),
];

impl PaymentApp {
    pub fn from_package(package: &str) -> Option<Self> {
        SUPPORTED_PACKAGES
            .iter()
            .find(|(name, _)| *name == package)
            .map(|(_, app)| *app)
    }

    /// Stable id stored in the database.
    pub fn id(self) -> &'static str {
        match self {
            Self::GooglePay => "googlepay",
            Self::PhonePe => "phonepe",
            Self::Revolut => "revolut",
            Self::PayPal => "paypal",
            Self::Paytm => "paytm",
            Self::Wise => "wise",
            Self::Venmo => "venmo",
            Self::CashApp => "cashapp",
        }
    }

    /// Name shown to the user.
    pub fn name(self) -> &'static str {
        match self {
            Self::GooglePay => "Google Pay",
            Self::PhonePe => "PhonePe",
            Self::Revolut => "Revolut",
            Self::PayPal => "PayPal",
            Self::Paytm => "Paytm",
            Self::Wise => "Wise",
            Self::Venmo => "Venmo",
            Self::CashApp => "Cash App",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        SUPPORTED_PACKAGES
            .iter()
            .map(|(_, app)| *app)
            .find(|app| app.id() == id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The Android service filters by its own list before anything reaches Rust. A package added to one list and
    /// not the other would be silently ignored (Kotlin) or read when it should not be (never: Rust re-checks).
    #[test]
    fn the_android_list_matches_this_one() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../modules/vise-core/android/src/main/java/expo/modules/visecore/PaymentApps.kt"
        );
        let kotlin = std::fs::read_to_string(path).expect("PaymentApps.kt exists");
        for (package, _) in SUPPORTED_PACKAGES {
            assert!(
                kotlin.contains(&format!("\"{package}\"")),
                "{package} is missing from PaymentApps.kt"
            );
        }
        let in_kotlin = kotlin.matches("\",").count() + kotlin.matches("\" //").count();
        assert_eq!(
            in_kotlin,
            SUPPORTED_PACKAGES.len(),
            "PaymentApps.kt lists a package this file does not"
        );
    }

    #[test]
    fn every_app_has_a_name_an_id_and_round_trips() {
        for (package, app) in SUPPORTED_PACKAGES {
            assert_eq!(PaymentApp::from_package(package), Some(app));
            assert_eq!(PaymentApp::from_id(app.id()), Some(app));
            assert!(!app.name().is_empty());
        }
        assert_eq!(PaymentApp::from_package("com.hdfcbank.android"), None);
        assert_eq!(PaymentApp::from_package(""), None);
    }
}
