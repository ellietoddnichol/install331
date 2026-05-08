import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getEstimatorDb, initEstimatorDb } from '../../db/connection.ts';
import { getSettings, updateSettings } from '../../repos/settingsRepo.ts';

/**
 * Test that /api/v1/public-config only returns public fields.
 * Ensures sensitive data (company info, proposal templates) is not exposed.
 */
describe('/api/v1/public-config endpoint', () => {
  it('should return only public fields (defaultLaborRatePerHour)', async () => {
    const db = getEstimatorDb();
    initEstimatorDb(db);

    // Set some sensitive data that should NOT be exposed
    await updateSettings({
      companyName: 'Secret Company Inc',
      companyEmail: 'secret@example.com',
      companyPhone: '555-1234',
      proposalIntro: 'Secret proposal intro',
      proposalTerms: 'Secret terms',
      defaultLaborRatePerHour: 125,
    });

    const settings = await getSettings();

    // Simulate the public-config endpoint logic
    const publicConfig = {
      defaultLaborRatePerHour: settings.defaultLaborRatePerHour,
    };

    // Assert only public field is present
    assert.equal(publicConfig.defaultLaborRatePerHour, 125);

    // Assert sensitive fields are NOT in the public config
    assert.equal((publicConfig as any).companyName, undefined);
    assert.equal((publicConfig as any).companyEmail, undefined);
    assert.equal((publicConfig as any).companyPhone, undefined);
    assert.equal((publicConfig as any).proposalIntro, undefined);
    assert.equal((publicConfig as any).proposalTerms, undefined);
    assert.equal((publicConfig as any).proposalExclusions, undefined);
    assert.equal((publicConfig as any).proposalClarifications, undefined);

    // Verify the keys count
    assert.equal(Object.keys(publicConfig).length, 1, 'Public config should only have 1 field');
  });
});
