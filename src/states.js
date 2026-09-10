/**
 * States and provinces, keyed by the country names used in countries.js.
 *
 * Salesforce validates State/Province against the selected country and raises a
 * "Field Integrity Exception" on anything else — which is what a free-text
 * State field produced. Only the two markets pinned to the top of the country
 * list are covered; for every other country the field is hidden and no State is
 * sent, which is valid because the handler does not require it.
 *
 * ponytail: two countries, not a full ISO 3166-2 dataset. Add another entry
 * here if the client starts selling into a market that needs it.
 */
export const STATES_BY_COUNTRY = {
  "United States": [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
    "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
    "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
    "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
    "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
    "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island",
    "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont",
    "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming",
  ],
  Canada: [
    "Alberta", "British Columbia", "Manitoba", "New Brunswick",
    "Newfoundland and Labrador", "Northwest Territories", "Nova Scotia",
    "Nunavut", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan",
    "Yukon",
  ],
};

/** The valid states for a country, or [] when it has no validated list. */
export const statesFor = (country) => STATES_BY_COUNTRY[country] ?? [];
