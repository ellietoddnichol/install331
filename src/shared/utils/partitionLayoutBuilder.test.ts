import assert from 'assert';
import { test } from 'node:test';
import {
  buildPartitionLayoutLines,
  countPartitionCompartments,
  DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
} from './partitionLayoutBuilder.ts';

test('buildPartitionLayoutLines splits standard and ADA compartments', () => {
  const lines = buildPartitionLayoutLines({
    ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
    standardStalls: 3,
    adaStalls: 1,
    materialSystem: 'toilet_partition_hdpe',
  });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].qty, 3);
  assert.equal(lines[0].key, 'std-compartments');
  assert.equal(lines[1].qty, 1);
  assert.equal(lines[1].key, 'ada-compartments');
  assert.equal(lines[0].installLaborFamily, 'toilet_partition_hdpe');
  assert.equal(lines[0].laborMinutes, 95);
});

test('buildPartitionLayoutLines adds hardware and placeholder when requested', () => {
  const lines = buildPartitionLayoutLines({
    ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
    standardStalls: 2,
    adaStalls: 0,
    materialSystem: 'toilet_partition_phenolic',
    includeHardwareKits: true,
    includeHeadrailPlaceholder: true,
  });
  const keys = lines.map((l) => l.key);
  assert.ok(keys.includes('partition-hardware'));
  assert.ok(keys.includes('headrail-placeholder'));
  const hw = lines.find((l) => l.key === 'partition-hardware');
  assert.equal(hw?.qty, 2);
  assert.equal(hw?.installScopeType, 'partition_hardware');
  assert.equal(hw?.hardwareMode, 'per_door');
  const ph = lines.find((l) => l.key === 'headrail-placeholder');
  assert.equal(ph?.laborMinutes, 0);
  assert.equal(ph?.installLaborFamily, null);
});

test('countPartitionCompartments', () => {
  assert.equal(countPartitionCompartments({ standardStalls: 4, adaStalls: 2 }), 6);
});

test('buildPartitionLayoutLines adds linear pilaster line when included', () => {
  const lines = buildPartitionLayoutLines({
    ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
    standardStalls: 3,
    adaStalls: 0,
    materialSystem: 'toilet_partition_hdpe',
    layoutShape: 'linear',
    includePilasterLine: true,
  });
  const p = lines.find((l) => l.key === 'pilaster-estimate');
  assert.equal(p?.qty, 4);
  assert.equal(p?.installLaborFamily, 'pilaster');
  assert.equal(p?.installScopeType, 'pilaster');
});

test('buildPartitionLayoutLines continuous hardware description', () => {
  const lines = buildPartitionLayoutLines({
    ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
    standardStalls: 1,
    adaStalls: 0,
    includeHardwareKits: true,
    hardwareMode: 'continuous_hinge',
  });
  const hw = lines.find((l) => l.key === 'partition-hardware');
  assert.ok(/continuous hinge/i.test(hw?.description ?? ''));
  assert.equal(hw?.hardwareMode, 'continuous_hinge');
});

test('buildPartitionLayoutLines ADA accessory package', () => {
  const lines = buildPartitionLayoutLines({
    ...DEFAULT_PARTITION_LAYOUT_BUILDER_INPUT,
    standardStalls: 0,
    adaStalls: 2,
    materialSystem: 'toilet_partition_hdpe',
    includeAdaAccessoryPackage: true,
    adaPackageGrabBars: true,
    adaPackageToiletTissue: true,
    adaPackageSoap: true,
  });
  const keys = new Set(lines.map((l) => l.key));
  assert.ok(keys.has('ada-grab-bar-36'));
  assert.ok(keys.has('ada-grab-bar-42'));
  assert.ok(keys.has('ada-toilet-tissue-dispenser'));
  assert.ok(keys.has('ada-soap-dispenser'));
  const g36 = lines.find((l) => l.key === 'ada-grab-bar-36');
  assert.equal(g36?.qty, 2);
  assert.equal(g36?.installLaborFamily, 'grab_bar_36');
});
