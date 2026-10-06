import type { FormField, FormInfo } from './extractAssets.js';

export interface FormTraits {
  hasDate: boolean;
  hasPickupReturnLocation: boolean;
  hasVehicleSelection: boolean;
  hasPaymentFields: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasName: boolean;
  hasMessage: boolean;
  isLogin: boolean;
  isSearch: boolean;
  isNewsletter: boolean;
  /** Request / quote / reservation wording in the form text. */
  hasBookingWording: boolean;
  hasQuoteWording: boolean;
}

const fieldText = (f: FormField) =>
  `${f.name} ${f.id} ${f.placeholder} ${f.label} ${f.classes}`.toLowerCase();

const DATE_RE =
  /\bdate\b|_date|date_|-date|date-|datepicker|flatpickr|pick-?up.?(?:date|time)|drop-?off.?(?:date|time)|return.?(?:date|time)|start.?date|end.?date|check-?in|check-?out|\bfrom.?date|\bto.?date/i;
const LOCATION_RE =
  /pick-?up.?(?:location|branch|place|point|address|loc)|drop-?off.?(?:location|branch|place|point|address|loc)|return.?(?:location|branch|place)|pickup_?loc|dropoff_?loc|\blocation\b|\bbranch\b/i;
const VEHICLE_RE =
  /vehicle|\bcar.?(?:type|class|model|category|group)|\bfleet\b|\bmodel\b|car_?id|vehicle_?id|\bclass\b|\bcategory\b/i;
const VEHICLE_OPTION_RE =
  /\b(?:suv|sedan|economy|compact|convertible|minivan|van|luxury|pickup truck|coupe|hatchback|lamborghini|ferrari|mercedes|bmw|audi|porsche|tesla|toyota|ford|chevrolet|jeep|range rover|rolls)\b/i;
const PAYMENT_RE =
  /card.?number|cc-?number|cardnumber|\bcvv\b|\bcvc\b|cc-csc|cc-exp|card.?exp|expiry|expiration/i;
const BOOKING_WORDING_RE =
  /\b(?:book(?:ing)?|reserv(?:e|ation)|rent now|check availability|availability|pick-?up|drop-?off|return date)\b/i;
const QUOTE_WORDING_RE = /\b(?:quote|request|enquir|inquir)/i;
const NEWSLETTER_RE = /newsletter|subscribe|mailing list|sign up for (?:our )?(?:emails|updates)/i;

export function classifyFields(fields: FormField[], text = '', classes = ''): FormTraits {
  const texts = fields.map(fieldText);
  const any = (re: RegExp) => texts.some((t) => re.test(t));
  const typed = (t: string) => fields.some((f) => f.type === t);
  const hasDate = typed('date') || typed('datetime-local') || any(DATE_RE);
  const hasEmail = typed('email') || any(/e-?mail/);
  const hasPhone = typed('tel') || any(/phone|\btel\b|mobile/);
  const hasName = any(/\bname\b|first.?name|last.?name|full.?name|your-name/);
  const hasMessage =
    fields.some((f) => f.tag === 'textarea') || any(/message|comments?|enquiry|inquiry/);
  const vehicleSelect = fields.some(
    (f) => f.tag === 'select' && f.options.filter((o) => VEHICLE_OPTION_RE.test(o)).length >= 2,
  );
  const visibleCount = fields.filter(
    (f) => !['submit', 'button', 'reset', 'image'].includes(f.type),
  ).length;
  const isSearch =
    typed('search') ||
    (visibleCount === 1 && fields.some((f) => /^(?:s|q|search|query)$/i.test(f.name))) ||
    /\bsearch-form\b|role="search"/.test(classes);
  const isNewsletter =
    hasEmail &&
    !hasMessage &&
    !hasPhone &&
    !hasDate &&
    visibleCount <= 3 &&
    (NEWSLETTER_RE.test(text) || NEWSLETTER_RE.test(classes));
  return {
    hasDate,
    hasPickupReturnLocation: any(LOCATION_RE) && (hasDate || any(/pick-?up|drop-?off|return/)),
    hasVehicleSelection: any(VEHICLE_RE) || vehicleSelect,
    hasPaymentFields: any(PAYMENT_RE),
    hasEmail,
    hasPhone,
    hasName,
    hasMessage,
    isLogin: typed('password'),
    isSearch,
    isNewsletter,
    hasBookingWording: BOOKING_WORDING_RE.test(text),
    hasQuoteWording: QUOTE_WORDING_RE.test(text),
  };
}

export function classifyForm(form: FormInfo): FormTraits {
  return classifyFields(form.fields, form.text, form.classes);
}

/** A form a visitor would use to contact the business (not search, login or newsletter). */
export function isContactForm(t: FormTraits): boolean {
  if (t.isLogin || t.isSearch || t.isNewsletter) return false;
  const details = [t.hasName, t.hasEmail, t.hasPhone].filter(Boolean).length;
  return (t.hasEmail || t.hasPhone) && (t.hasMessage || details >= 2);
}
