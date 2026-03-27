export interface BankHelpEntry {
  name: string;
  url: string;
  instructions: string;
}

export const BANK_HELP_ENTRIES: BankHelpEntry[] = [
  { name: 'Bank of America', url: 'https://www.bankofamerica.com/', instructions: 'Sign in, open your business checking account, then look for Statements & Documents or eStatements to download the last 4 monthly PDFs.' },
  { name: 'Chase', url: 'https://www.chase.com/', instructions: 'After signing in, choose your business account, open Statements, and download the 4 most recent monthly statement PDFs.' },
  { name: 'Wells Fargo', url: 'https://www.wellsfargo.com/', instructions: 'Open your account details, go to Statements & Documents, and save the last 4 completed monthly PDF statements.' },
  { name: 'Citi', url: 'https://www.citi.com/', instructions: 'Sign in to online banking, select the correct account, and download the 4 latest statement PDFs from Statements or Documents.' },
  { name: 'U.S. Bank', url: 'https://www.usbank.com/', instructions: 'Choose your business account, open Documents or Statements, and export the last 4 completed monthly statements as PDFs.' },
  { name: 'PNC', url: 'https://www.pnc.com/', instructions: 'In online banking, open your account, go to Statements, and download the 4 most recent monthly statement PDFs.' },
  { name: 'Truist', url: 'https://www.truist.com/', instructions: 'Sign in, select your business account, find Statements, and save the last 4 monthly PDF statements to your device.' },
  { name: 'Capital One', url: 'https://www.capitalone.com/', instructions: 'Open your account dashboard, visit Statements, and download the latest 4 monthly statement PDFs.' },
  { name: 'TD Bank', url: 'https://www.tdbank.com/us/en/personal-banking', instructions: 'After logging in, choose the right account and use Statements & Notices to download the 4 newest monthly PDFs.' },
  { name: 'Regions', url: 'https://www.regions.com/', instructions: 'Select your account, open Online Statements, and download the last 4 monthly statement PDFs.' },
  { name: 'Fifth Third', url: 'https://www.53.com/', instructions: 'Sign in, go to your checking account, open Documents or Statements, and download the last 4 monthly PDFs.' },
  { name: 'Huntington', url: 'https://www.huntington.com/', instructions: 'Open the correct account in online banking, head to Statements, and save the most recent 4 monthly PDF statements.' },
  { name: 'M&T Bank', url: 'https://www.mtb.com/', instructions: 'Choose your business account, find Statements & Documents, and download the 4 latest monthly PDFs.' },
  { name: 'Citizens', url: 'https://www.citizensbank.com/', instructions: 'In online banking, select the business account and use Statements to pull the last 4 monthly PDF statements.' },
  { name: 'Navy Federal', url: 'https://www.navyfederal.org/', instructions: 'After signing in, open your account, go to Statements, and download the 4 most recent completed monthly PDFs.' },
  { name: 'First Citizens', url: 'https://www.firstcitizens.com/', instructions: 'Select the correct account, open Statements or Documents, and save the latest 4 monthly statement PDFs.' },
  { name: 'BMO', url: 'https://www.bmo.com/', instructions: 'Sign in, choose your account, open Statements, and download the 4 newest monthly PDF statements.' },
  { name: 'KeyBank', url: 'https://www.key.com/', instructions: 'Go to your business checking account, open Statements & Documents, and download the last 4 monthly PDFs.' },
  { name: 'Santander', url: 'https://www.santanderbank.com/us', instructions: 'Log in, open your account details, and download the 4 most recent monthly statement PDFs from Statements.' },
  { name: 'SoFi', url: 'https://www.sofi.com/', instructions: 'Open banking, choose the account, then export the last 4 monthly statement PDFs from Statements or Documents.' },
];