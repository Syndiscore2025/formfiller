I have I # Tenant Settings & Form Builder Foundation

## Goal

Allow each tenant to configure the merchant application without code changes:

- visible/hidden standard fields
- custom fields
- custom questions
- custom validation
- conditional logic
- branding, logo, colors, and company information
- PDF/review output visibility

## Recommended Data Model

### TenantBranding

Stores presentation and company identity.

Suggested fields:

- tenantId
- companyName
- logoUrl
- primaryColor
- secondaryColor
- accentColor
- supportEmail
- supportPhone
- websiteUrl
- legalBusinessName
- privacyPolicyUrl
- termsUrl
- disclosureText

### TenantApplicationConfig

Stores the configurable application definition as versioned JSON.

Suggested fields:

- tenantId
- version
- isActive
- standardFieldConfig JSON
- customFields JSON
- customQuestions JSON
- validationRules JSON
- conditionalLogic JSON
- pdfLayoutConfig JSON
- createdAt
- updatedAt

## Standard Field Config Shape

Each standard field should support:

- key
- label
- visible
- required
- editable
- section
- order
- showInReview
- showInPdf
- validationRules
- helpText

Example keys:

- business.legalName
- business.industry
- business.sicCode
- business.naicsCode
- business.businessStartDate
- owner.ssn
- loanRequest.amountRequested

## Custom Field Shape

Each custom field should support:

- id
- section
- label
- type: text | number | currency | date | select | multiselect | checkbox | textarea | file
- required
- options
- placeholder
- helpText
- showInReview
- showInPdf
- validationRules
- conditionalVisibility

## Custom Question Shape

Custom questions are higher-level prompts that can live between sections or inside a section.

Each custom question should support:

- id
- section
- question
- answerType
- required
- options
- showInReview
- showInPdf
- validationRules
- conditionalVisibility

## Validation Rule Shape

Validation rules should be declarative, not arbitrary code.

Supported rule types should include:

- required
- minLength
- maxLength
- min
- max
- regex
- email
- phone
- dateBefore
- dateAfter
- currencyMin
- currencyMax
- customMessage

## Conditional Logic Shape

Conditional logic should also be declarative.

Examples:

- show field B if field A equals yes
- require field C if amountRequested is greater than 250000
- hide owner SSN if tenant disables credit review
- show upload step only if tenant requires bank statements

Suggested condition fields:

- sourceField
- operator: equals | notEquals | contains | greaterThan | lessThan | exists | empty
- value
- action: show | hide | require | optional | setValue
- targetField

## Current Implemented Tenant Settings

The current codebase implements the first production tenant-settings layer directly on `TenantSettings`:

- Branding/company identity: company name, legal business name, logo URL/base64, company email, company phone, company address, website URL, support email.
- Theme: `dark`/`light`, accent color, surface color.
- PDF/privacy toggles: show contact email, show contact phone, show annual revenue, show amount requested.
- Switchbox delivery: endpoint URL and write-only API key.
- Document storage: provider (`database` or `s3`), endpoint, region, bucket, prefix, access key ID, encrypted/write-only secret access key, optional public base URL.

Current settings endpoints:

- `GET /api/tenant/settings` returns public-safe branding/theme/privacy settings for the merchant application.
- `GET /api/tenant/settings/admin` requires JWT auth and returns full admin settings with secrets masked.
- `PATCH /api/tenant/settings/admin` requires JWT auth and updates branding, theme, privacy, Switchbox delivery, and storage settings.

Current PDF privacy behavior:

- The settings affect the merchant review screen, generated signed PDF, and outbound Switchbox/lender API payload.
- When toggled off, email/phone/revenue/amount requested are removed from the PDF and sent as `null` in the lender API payload.
- Bank statements are always sent to Switchbox regardless of these four toggles.

Current credential behavior:

- Real secrets must not be committed to Markdown or Postman files.
- Switchbox API key and storage secret access key are treated as write-only/masked settings values.
- Storage secret access key is encrypted at rest before database storage.

## Implementation Phases

### Phase 1: Branding

Status: substantially implemented for company identity, logo, theme, and application UI/PDF branding.

### Phase 2: Standard Field Visibility

Status: partially implemented for PDF/privacy visibility of contact email, contact phone, annual revenue, and amount requested. Future work should generalize this to all standard fields with versioned config snapshots.

### Phase 3: Custom Fields & Questions

Add storage and rendering for custom fields and questions.

### Phase 4: Custom Validation

Add declarative validation rules to frontend and backend validation.

### Phase 5: Conditional Logic

Add declarative show/hide/require/set-value logic.

### Phase 6: Settings UI

Status: implemented for branding, theme, PDF privacy, Switchbox delivery, and document storage. Future phases should add dynamic field/question builder support.

## Security Notes

- Never allow arbitrary JavaScript logic from tenant settings.
- Validate every custom field on both frontend and backend.
- Version each config so submitted applications can preserve the exact form definition used at signing time.
- Store custom answers separately from the config snapshot.
- Include visible custom fields/questions in the signed PDF and audit trail.
- Keep tenant settings admin endpoints behind JWT authentication.
- Keep lender/API/storage secrets out of source-controlled docs and Postman exports.
- Mask/write-only all secret settings returned to the admin UI.
- Preserve final signed configuration state in audit/signature records where compliance requires proof of what the merchant saw and signed.

## Compliance Notes

- ESIGN/UETA support depends on preserving signer identity, consent text, electronic signature data, IP address, user agent, and signed timestamp.
- TCPA/contact consent depends on preserving the contact authorization language and merchant acknowledgement.
- GLBA-supporting controls require encrypted sensitive fields, private document storage, least-privilege credential access, auditability, and documented retention/deletion policies.
- Any future custom fields that collect sensitive financial or identity data must be classified and protected before production use.
