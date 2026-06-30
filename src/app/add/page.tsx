export default function AddListingPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-2">Add Listing Manually</h1>
      <p className="text-slate-600 mb-6">Use this when you find a property outside an email alert.</p>
      <form action="/api/manual-listing" method="post" className="card p-6 space-y-4">
        <div><label className="label">Title</label><input name="title" required className="input" /></div>
        <div><label className="label">Source</label><input name="source" defaultValue="Manual" className="input" /></div>
        <div><label className="label">Opportunity Stage</label><select name="marketStage" className="input"><option>Listed</option><option>Pre-Market</option></select></div>
        <div><label className="label">Listing URL</label><input name="listingUrl" className="input" /></div>
        <div><label className="label">Address</label><input name="address" className="input" /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Acreage</label><input name="acreage" type="number" step="0.01" required className="input" /></div>
          <div><label className="label">Price</label><input name="price" type="number" step="1" className="input" /></div>
        </div>
        <div><label className="label">Broker Email</label><input name="brokerEmail" className="input" /></div>
        <div><label className="label">Broker Phone</label><input name="brokerPhone" className="input" /></div>
        <button className="btn btn-primary">Save Listing</button>
      </form>
    </div>
  );
}
