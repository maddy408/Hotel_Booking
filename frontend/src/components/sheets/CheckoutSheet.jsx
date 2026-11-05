import { useState } from 'react';
import Sheet, { SheetHeader } from '../Sheet.jsx';
import { useStay, useStayBill, useAddExtra, useRemoveExtra, useExtendStay, useCheckout } from '../../api/stays';
import { useToast } from '../../context/ToastContext.jsx';
import { fd, inr } from '../../lib/format';

const EXTRAS = ['Food', 'Laundry', 'Extra bed', 'Taxi', 'Other'];

export default function CheckoutSheet({ stayId, onClose }) {
  const { data: stay } = useStay(stayId);
  const { data: bill } = useStayBill(stayId);
  const addExtra = useAddExtra();
  const removeExtra = useRemoveExtra();
  const extend = useExtendStay();
  const checkout = useCheckout();
  const toast = useToast();

  const [xLabel, setXLabel] = useState('Food');
  const [xAmount, setXAmount] = useState('');
  const [pay, setPay] = useState('cash');
  const [confirming, setConfirming] = useState(false);

  if (!stay || !bill) {
    return (
      <Sheet onClose={onClose}>
        <SheetHeader status="occupied" title="Check out" onClose={onClose} />
        <div className="sb">
          <div className="skel" style={{ height: 140 }} />
        </div>
      </Sheet>
    );
  }

  const addExtraCharge = async () => {
    const amt = Number(xAmount);
    if (!(amt > 0)) {
      toast('Enter the amount.');
      return;
    }
    await addExtra.mutateAsync({ stayId, label: xLabel, amount: amt, isTaxable: false });
    setXAmount('');
    setConfirming(false);
  };

  const doCheckout = async () => {
    try {
      const result = await checkout.mutateAsync({ stayId, paymentMethod: pay });
      onClose();
      toast(
        `${stay.guest_name.split(' ')[0]} checked out. Bill ${inr(result.bill.total)}. Room ${stay.room_no} sent for cleaning.`,
      );
    } catch (err) {
      toast(err.message);
    }
  };

  const bal = bill.balance;

  return (
    <Sheet onClose={onClose}>
      <SheetHeader status="occupied" badge={stay.room_no} title="Check out" subtitle={stay.room_type_name} onClose={onClose} />
      <div className="sb">
        <dl className="info">
          <dt>Guest</dt>
          <dd>{stay.guest_name}</dd>
          <dt>Mobile</dt>
          <dd className="mono">{stay.guest_phone}</dd>
          <dt>ID proof</dt>
          <dd>
            {stay.id_proof_type} <span className="mono">{stay.id_proof_last4 ? `••••${stay.id_proof_last4}` : ''}</span>
          </dd>
          <dt>Came on</dt>
          <dd>{fd(stay.check_in_date)}</dd>
          <dt>Planned to leave</dt>
          <dd>
            {fd(stay.checkout_planned)}
            {stay.checkout_planned <= new Date().toISOString().slice(0, 10) && <span style={{ color: 'var(--mark)' }}> (today)</span>}
          </dd>
          <dt>Persons</dt>
          <dd>{stay.persons}</dd>
        </dl>

        <table className="bill">
          <tbody>
            <tr>
              <td>
                {bill.nights} night{bill.nights > 1 ? 's' : ''} × {inr(stay.rate)}
              </td>
              <td>{inr(bill.roomAmount)}</td>
            </tr>
            <tr className="sub">
              <td>GST {Math.round(bill.gstRate * 100)}%</td>
              <td>{inr(bill.roomGstAmount)}</td>
            </tr>
            {bill.charges.map((x) => (
              <tr key={x.id}>
                <td>
                  {x.label}{' '}
                  <button
                    className="rm"
                    type="button"
                    aria-label="Remove"
                    onClick={() => removeExtra.mutate({ stayId, chargeId: x.id })}
                  >
                    ×
                  </button>
                </td>
                <td>{inr(x.amount)}</td>
              </tr>
            ))}
            <tr className="tot">
              <td>Total bill</td>
              <td>{inr(bill.total)}</td>
            </tr>
            <tr className="sub">
              <td>Advance paid</td>
              <td>−{inr(bill.advancePaid)}</td>
            </tr>
            <tr className="bal">
              <td>{bal >= 0 ? 'Collect now' : 'Give back'}</td>
              <td>{inr(Math.abs(bal))}</td>
            </tr>
          </tbody>
        </table>

        <div className="f">
          <label>Add extra charge</label>
          <div className="addc">
            <select aria-label="Charge" value={xLabel} onChange={(e) => setXLabel(e.target.value)}>
              {EXTRAS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <input type="number" min="1" placeholder="₹ amount" aria-label="Amount" value={xAmount} onChange={(e) => setXAmount(e.target.value)} />
            <button className="btn sm" type="button" disabled={addExtra.isPending} onClick={addExtraCharge}>
              Add
            </button>
          </div>
        </div>

        <div className="f">
          <label>Guest pays by</label>
          <div className="seg">
            {['cash', 'upi', 'card'].map((p) => (
              <button key={p} type="button" aria-pressed={pay === p} onClick={() => setPay(p)}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {confirming ? (
          <div className="confirm">
            <b>{bal >= 0 ? `Collected ${inr(bal)} by ${pay.toUpperCase()}?` : `Gave back ${inr(-bal)}?`}</b>
            <span className="muted">Room {stay.room_no} will go for cleaning.</span>
            <div className="row2">
              <button className="btn blue" type="button" disabled={checkout.isPending} onClick={doCheckout}>
                Yes, check out
              </button>
              <button className="btn" type="button" onClick={() => setConfirming(false)}>
                No
              </button>
            </div>
          </div>
        ) : (
          <button className="btn blue big" type="button" onClick={() => setConfirming(true)}>
            Check out · {bal >= 0 ? 'Collect' : 'Return'} {inr(Math.abs(bal))}
          </button>
        )}

        <button
          className="btn sm"
          type="button"
          style={{ alignSelf: 'flex-start' }}
          disabled={extend.isPending}
          onClick={async () => {
            try {
              await extend.mutateAsync(stayId);
              toast(`Room ${stay.room_no} extended.`);
            } catch (err) {
              toast(err.message);
            }
          }}
        >
          Guest staying 1 more day
        </button>
      </div>
    </Sheet>
  );
}
