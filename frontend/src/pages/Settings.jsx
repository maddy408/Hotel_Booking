import { useEffect, useState } from 'react';
import { useSettings, useUpdateHotel, useUpdateGst } from '../api/settings';
import { useToast } from '../context/ToastContext.jsx';

export default function Settings() {
  const { data, isLoading } = useSettings();
  const updateHotel = useUpdateHotel();
  const updateGst = useUpdateGst();
  const toast = useToast();

  const [hotel, setHotel] = useState(null);
  const [gst, setGst] = useState(null);

  useEffect(() => {
    if (data && !hotel) setHotel(data.hotel);
    if (data && !gst) {
      setGst({
        gstSlab1MaxRate: data.settings.gst_slab1_max_rate,
        gstSlab1GstRate: Number(data.settings.gst_slab1_gst_rate) * 100,
        gstSlab2MaxRate: data.settings.gst_slab2_max_rate,
        gstSlab2GstRate: Number(data.settings.gst_slab2_gst_rate) * 100,
        gstSlab3GstRate: Number(data.settings.gst_slab3_gst_rate) * 100,
        taxExtras: !!data.settings.tax_extras,
        checkoutHour: data.settings.checkout_hour,
      });
    }
  }, [data, hotel, gst]);

  if (isLoading || !hotel || !gst) {
    return (
      <div className="mgrid">
        <div className="skel" style={{ height: 220 }} />
        <div className="skel" style={{ height: 220 }} />
      </div>
    );
  }

  const saveHotel = async (e) => {
    e.preventDefault();
    try {
      await updateHotel.mutateAsync(hotel);
      toast('Hotel details saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  const saveGst = async (e) => {
    e.preventDefault();
    try {
      await updateGst.mutateAsync({
        gstSlab1MaxRate: Number(gst.gstSlab1MaxRate),
        gstSlab1GstRate: Number(gst.gstSlab1GstRate) / 100,
        gstSlab2MaxRate: Number(gst.gstSlab2MaxRate),
        gstSlab2GstRate: Number(gst.gstSlab2GstRate) / 100,
        gstSlab3GstRate: Number(gst.gstSlab3GstRate) / 100,
        taxExtras: gst.taxExtras,
        checkoutHour: Number(gst.checkoutHour),
      });
      toast('GST settings saved.');
    } catch (err) {
      toast(err.message);
    }
  };

  return (
    <div className="mgrid">
      <div className="panel">
        <div className="ph">
          <h2>Hotel details</h2>
        </div>
        <form className="sb" onSubmit={saveHotel}>
          <div className="fg">
            <div className="f full">
              <label htmlFor="s-name">Hotel name *</label>
              <input id="s-name" type="text" required value={hotel.name} onChange={(e) => setHotel({ ...hotel, name: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-place">Place</label>
              <input id="s-place" type="text" value={hotel.place || ''} onChange={(e) => setHotel({ ...hotel, place: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-gstin">GSTIN</label>
              <input id="s-gstin" type="text" value={hotel.gstin || ''} onChange={(e) => setHotel({ ...hotel, gstin: e.target.value })} />
            </div>
            <div className="f full">
              <label htmlFor="s-address">Address</label>
              <input id="s-address" type="text" value={hotel.address || ''} onChange={(e) => setHotel({ ...hotel, address: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-phone">Phone</label>
              <input id="s-phone" type="tel" value={hotel.phone || ''} onChange={(e) => setHotel({ ...hotel, phone: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="s-email">Email</label>
              <input id="s-email" type="email" value={hotel.email || ''} onChange={(e) => setHotel({ ...hotel, email: e.target.value })} />
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateHotel.isPending} style={{ alignSelf: 'flex-start' }}>
            Save hotel details
          </button>
        </form>
      </div>

      <div className="panel">
        <div className="ph">
          <h2>GST &amp; checkout</h2>
        </div>
        <form className="sb" onSubmit={saveGst}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Hotel room tariff GST slabs, by nightly rate. These apply to every new booking and check-in bill.
          </p>
          <div className="fg">
            <div className="f">
              <label htmlFor="g-s1max">0% up to rate (₹)</label>
              <input id="g-s1max" type="number" min="0" value={gst.gstSlab1MaxRate} onChange={(e) => setGst({ ...gst, gstSlab1MaxRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s2max">5% up to rate (₹)</label>
              <input id="g-s2max" type="number" min="0" value={gst.gstSlab2MaxRate} onChange={(e) => setGst({ ...gst, gstSlab2MaxRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s1rate">Slab 1 GST %</label>
              <input id="g-s1rate" type="number" min="0" max="100" value={gst.gstSlab1GstRate} onChange={(e) => setGst({ ...gst, gstSlab1GstRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s2rate">Slab 2 GST %</label>
              <input id="g-s2rate" type="number" min="0" max="100" value={gst.gstSlab2GstRate} onChange={(e) => setGst({ ...gst, gstSlab2GstRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-s3rate">Above slab-2 GST %</label>
              <input id="g-s3rate" type="number" min="0" max="100" value={gst.gstSlab3GstRate} onChange={(e) => setGst({ ...gst, gstSlab3GstRate: e.target.value })} />
            </div>
            <div className="f">
              <label htmlFor="g-hour">Checkout hour (24h)</label>
              <input id="g-hour" type="number" min="0" max="23" value={gst.checkoutHour} onChange={(e) => setGst({ ...gst, checkoutHour: e.target.value })} />
            </div>
            <div className="f full">
              <label>Apply GST to extra charges too</label>
              <div className="seg">
                <button type="button" aria-pressed={gst.taxExtras} onClick={() => setGst({ ...gst, taxExtras: true })}>
                  Yes
                </button>
                <button type="button" aria-pressed={!gst.taxExtras} onClick={() => setGst({ ...gst, taxExtras: false })}>
                  No
                </button>
              </div>
            </div>
          </div>
          <button className="btn dark" type="submit" disabled={updateGst.isPending} style={{ alignSelf: 'flex-start' }}>
            Save GST settings
          </button>
        </form>
      </div>
    </div>
  );
}
