# Tenant Settings & Form Builder Foundation

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

## Implementation Phases

### Phase 1: Branding

Add tenant logo, company name, colors, and disclosure text to the application UI and PDF.

### Phase 2: Standard Field Visibility

Allow tenants to hide/show standard fields and choose whether each appears in review/PDF.

### Phase 3: Custom Fields & Questions

Add storage and rendering for custom fields and questions.

### Phase 4: Custom Validation

Add declarative validation rules to frontend and backend validation.

### Phase 5: Conditional Logic

Add declarative show/hide/require/set-value logic.

### Phase 6: Settings UI

Create an admin settings page where tenant admins manage branding, fields, questions, validation, and logic.

## Security Notes

- Never allow arbitrary JavaScript logic from tenant settings.
- Validate every custom field on both frontend and backend.
- Version each config so submitted applications can preserve the exact form definition used at signing time.
- Store custom answers separately from the config snapshot.
- Include visible custom fields/questions in the signed PDF and audit trail.
