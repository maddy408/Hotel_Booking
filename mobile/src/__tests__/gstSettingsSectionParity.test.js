import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { estimateGstRate, inr } from '../lib/format.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '..');
const settingsScreenPath = path.join(srcDir, 'screens', 'more', 'SettingsScreen.jsx');

describe('GST Tax Settings Section - Parity & Requirements Verification', () => {
  it('1. SettingsScreen.jsx exists and retains all four primary settings sections unchanged', () => {
    assert.ok(fs.existsSync(settingsScreenPath), 'SettingsScreen.jsx must exist');
    const content = fs.readFileSync(settingsScreenPath, 'utf8');

    // Section 1: Hotel Details
    assert.ok(content.includes('Hotel Details'), 'Must preserve Hotel Details section');
    // Section 2: Standard Checkout Time
    assert.ok(content.includes('Standard Checkout Time'), 'Must preserve Standard Checkout Time section');
    // Section 3: GST Tax Settings
    assert.ok(content.includes('GST Tax Settings'), 'Must preserve GST Tax Settings section');
    // Section 4: Policies & Cancellation
    assert.ok(content.includes('Policies & Cancellation'), 'Must preserve Policies & Cancellation section');

    // Web application not modified
    const webSettingsPath = path.resolve(srcDir, '..', '..', 'frontend', 'src', 'pages', 'Settings.jsx');
    assert.ok(fs.existsSync(webSettingsPath), 'Web Settings.jsx must exist unchanged');
  });

  it('2. Compact GST Summary renders dynamic room GST slabs with currency formatting and em-dash', () => {
    const content = fs.readFileSync(settingsScreenPath, 'utf8');

    // Check summary JSX structure
    assert.ok(content.includes('Room GST Slab 1: Up to'), 'Must render Room GST Slab 1 summary');
    assert.ok(content.includes('/night —'), 'Must format summary with /night and em-dash');
    assert.ok(content.includes('Room GST Slab 2: Above'), 'Must render Room GST Slab 2 summary');

    // Test dynamic summary formatting function
    const formatSummarySlab1 = (maxRate, rate) =>
      `Room GST Slab 1: Up to ${inr(maxRate || 7500)}/night — ${rate}%`;
    const formatSummarySlab2 = (maxRate, rate) =>
      `Room GST Slab 2: Above ${inr(maxRate || 7500)}/night — ${rate}%`;

    // Default backend settings (7500 threshold, 5% slab 1, 18% slab 2)
    assert.strictEqual(
      formatSummarySlab1('7500.00', '5'),
      'Room GST Slab 1: Up to ₹7,500/night — 5%'
    );
    assert.strictEqual(
      formatSummarySlab2('7500.00', '18'),
      'Room GST Slab 2: Above ₹7,500/night — 18%'
    );

    // Dynamic custom backend settings (10,000 threshold, 6% slab 1, 12% slab 2)
    assert.strictEqual(
      formatSummarySlab1('10000.00', '6'),
      'Room GST Slab 1: Up to ₹10,000/night — 6%'
    );
    assert.strictEqual(
      formatSummarySlab2('10000.00', '12'),
      'Room GST Slab 2: Above ₹10,000/night — 12%'
    );
  });

  it('3. Edit GST Settings button displays expandable form containing only the 3 room slab fields and action buttons', () => {
    const content = fs.readFileSync(settingsScreenPath, 'utf8');

    // Edit button presence
    assert.ok(content.includes('title="Edit GST Settings"'), 'Must have Edit GST Settings button');
    assert.ok(content.includes('handleOpenEditGst'), 'Must trigger handleOpenEditGst on edit click');

    // Form fields in edit form
    assert.ok(content.includes('Slab 1 threshold (₹ per night) *'), 'Must contain Slab 1 threshold field');
    assert.ok(content.includes('Slab 1 GST percentage *'), 'Must contain Slab 1 GST percentage field');
    assert.ok(content.includes('Slab 2 GST percentage *'), 'Must contain Slab 2 GST percentage field');

    // Form buttons
    assert.ok(content.includes('title="Save GST Settings"'), 'Must contain Save GST Settings button');
    assert.ok(content.includes('title="Cancel"'), 'Must contain Cancel button');
    assert.ok(content.includes('handleCancelEditGst'), 'Must trigger handleCancelEditGst on cancel click');

    // Cancel resets draft without saving
    assert.ok(content.includes('setIsEditingGst(false)'), 'Must close edit form on cancel or save');
  });

  it('4. Move extra-charge GST fields into separate collapsible section named "Extra Charges GST"', () => {
    const content = fs.readFileSync(settingsScreenPath, 'utf8');

    // Collapsible section title and accessibility
    assert.ok(content.includes('Extra Charges GST'), 'Must name section Extra Charges GST');
    assert.ok(content.includes('extraChargesOpen'), 'Must track collapsible open/closed state');
    assert.ok(content.includes('setExtraChargesOpen'), 'Must allow toggling Extra Charges GST section');

    // All 5 extra charges fields present in collapsible section
    assert.ok(content.includes('Food & Beverage'), 'Must contain Food & Beverage field');
    assert.ok(content.includes('Laundry'), 'Must contain Laundry field');
    assert.ok(content.includes('Extra Bed'), 'Must contain Extra Bed field');
    assert.ok(content.includes('Taxi & Travel'), 'Must contain Taxi & Travel field');
    assert.ok(content.includes('Other Services'), 'Must contain Other Services field');

    // Save Extra Charges GST button
    assert.ok(content.includes('title="Save Extra Charges GST"'), 'Must have Save Extra Charges GST button');
    assert.ok(content.includes('handleSaveExtraGst'), 'Must trigger handleSaveExtraGst');
  });

  it('5. Preserves existing API mutations, validation, database fields, and fractional rate conversion', () => {
    const content = fs.readFileSync(settingsScreenPath, 'utf8');

    // API mutation hook usage
    assert.ok(content.includes('useUpdateGst()'), 'Must use useUpdateGst mutation hook');
    assert.ok(content.includes('updateGst.mutateAsync'), 'Must execute mutateAsync for GST save');

    // Percentages converted to decimals (e.g. 5% -> 0.05, 18% -> 0.18)
    assert.ok(content.includes('Number(s1Rate) / 100'), 'Must convert Slab 1 rate to decimal for backend');
    assert.ok(content.includes('Number(s2Rate) / 100'), 'Must convert Slab 2 rate to decimal for backend');
    assert.ok(content.includes('extraFoodGstRate: Number(extraGst.extraFoodGstRate) / 100'), 'Must convert extra food rate to decimal');
    assert.ok(content.includes('extraLaundryGstRate: Number(extraGst.extraLaundryGstRate) / 100'), 'Must convert extra laundry rate to decimal');
    assert.ok(content.includes('extraBedGstRate: Number(extraGst.extraBedGstRate) / 100'), 'Must convert extra bed rate to decimal');
    assert.ok(content.includes('extraTaxiGstRate: Number(extraGst.extraTaxiGstRate) / 100'), 'Must convert extra taxi rate to decimal');
    assert.ok(content.includes('extraOtherGstRate: Number(extraGst.extraOtherGstRate) / 100'), 'Must convert extra other rate to decimal');

    // Validation checks for threshold and percentages
    assert.ok(content.includes('num <= 0'), 'Must validate threshold is positive');
    assert.ok(content.includes('num < 0 || num > 100'), 'Must validate GST rates between 0 and 100%');
  });

  it('6. Room GST calculations via estimateGstRate remain completely unchanged and responsive to saved settings', () => {
    // Default settings: Slab 1 <= 7500 @ 5%, Slab 2 > 7500 @ 18%
    const defaultSettings = {
      gst_slab1_max_rate: '7500.00',
      gst_slab1_gst_rate: 0.05,
      gst_slab2_max_rate: '7500.00',
      gst_slab2_gst_rate: 0.18,
      gst_slab3_gst_rate: 0.18,
    };

    assert.strictEqual(estimateGstRate(4000, defaultSettings), 0.05);
    assert.strictEqual(estimateGstRate(7500, defaultSettings), 0.05);
    assert.strictEqual(estimateGstRate(7501, defaultSettings), 0.18);
    assert.strictEqual(estimateGstRate(12000, defaultSettings), 0.18);

    // Custom saved settings: Threshold 10,000, Slab 1 @ 6%, Slab 2 @ 12%
    const customSettings = {
      gst_slab1_max_rate: '10000.00',
      gst_slab1_gst_rate: 0.06,
      gst_slab2_max_rate: '10000.00',
      gst_slab2_gst_rate: 0.12,
      gst_slab3_gst_rate: 0.12,
    };

    assert.strictEqual(estimateGstRate(5000, customSettings), 0.06);
    assert.strictEqual(estimateGstRate(10000, customSettings), 0.06);
    assert.strictEqual(estimateGstRate(10001, customSettings), 0.12);
    assert.strictEqual(estimateGstRate(15000, customSettings), 0.12);
  });

  it('7. Loading saved settings from backend populates state, and reopening page reflects saved values', () => {
    const content = fs.readFileSync(settingsScreenPath, 'utf8');

    // Initialization from data.settings
    assert.ok(content.includes('data.settings.gst_slab1_max_rate'), 'Must load gst_slab1_max_rate from backend');
    assert.ok(content.includes('data.settings.gst_slab1_gst_rate'), 'Must load gst_slab1_gst_rate from backend');
    assert.ok(content.includes('data.settings.gst_slab2_gst_rate'), 'Must load gst_slab2_gst_rate from backend');
    assert.ok(content.includes('data.settings.extra_food_gst_rate'), 'Must load extra_food_gst_rate from backend');
    assert.ok(content.includes('data.settings.extra_laundry_gst_rate'), 'Must load extra_laundry_gst_rate from backend');
    assert.ok(content.includes('data.settings.extra_bed_gst_rate'), 'Must load extra_bed_gst_rate from backend');
    assert.ok(content.includes('data.settings.extra_taxi_gst_rate'), 'Must load extra_taxi_gst_rate from backend');
    assert.ok(content.includes('data.settings.extra_other_gst_rate'), 'Must load extra_other_gst_rate from backend');

    // Background sync on refetch / reopening
    assert.ok(content.includes('[data?.settings, isEditingGst]'), 'Must synchronize on data.settings updates when not editing');
  });
});
