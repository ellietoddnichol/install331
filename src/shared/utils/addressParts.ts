export type AddressParts = {
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
  county: string;
};

const EMPTY: AddressParts = {
  address1: '',
  address2: '',
  city: '',
  state: '',
  zip: '',
  county: '',
};

function stripTrailingCountry(parts: string[]): string[] {
  if (parts.length === 0) return parts;
  const last = parts[parts.length - 1] || '';
  if (/^(USA|U\.?S\.?A\.?|United States of America|United States)$/i.test(last)) {
    return parts.slice(0, -1);
  }
  return parts;
}

/** Split a single stored address line into editable street / city / state / zip fields. */
export function parseAddressParts(address: string | null | undefined): AddressParts {
  const raw = String(address || '').trim();
  if (!raw) return { ...EMPTY };

  let parts = stripTrailingCountry(raw.split(',').map((p) => p.trim()).filter(Boolean));
  if (parts.length === 0) return { ...EMPTY };

  if (parts.length === 1) {
    return { ...EMPTY, address1: parts[0]! };
  }

  const last = parts[parts.length - 1] || '';
  const stateZip = last.match(/^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (stateZip) {
    const city = parts.length >= 2 ? parts[parts.length - 2] || '' : '';
    const streetParts = parts.slice(0, -2);
    return {
      address1: streetParts[0] || '',
      address2: streetParts.length > 1 ? streetParts.slice(1).join(', ') : '',
      city,
      state: stateZip[1] || '',
      zip: stateZip[2] || '',
      county: '',
    };
  }

  if (parts.length === 2) {
    return {
      ...EMPTY,
      address1: parts[0] || '',
      city: parts[1] || '',
    };
  }

  return {
    address1: parts[0] || '',
    address2: parts.length > 2 ? parts.slice(1, -1).join(', ') : '',
    city: parts[parts.length - 1] || '',
    state: '',
    zip: '',
    county: '',
  };
}

export function composeAddress(parts: AddressParts): string | null {
  const left = [parts.address1, parts.address2].map((v) => v.trim()).filter(Boolean);
  const city = parts.city.trim();
  const state = parts.state.trim().toUpperCase();
  const zip = parts.zip.trim();
  const stateZip = [state, zip].filter(Boolean).join(' ').trim();
  const right = [city, stateZip].filter(Boolean);
  const full = [...left, ...right].join(', ').trim();
  return full || null;
}
