import { ServicePicker } from '@/components/service-picker';
import { nonJudicialFlows } from '@/lib/intake-flows';

// 5-14-26 addendum: "copy of fir is not only copy of fir its also search
// criminal record by cnic." The two services are merged into a single
// landing tile titled "FIR & Criminal Record". Internally both
// `non_judicial_copy_of_fir` and `non_judicial_criminal_record_search`
// flows + service-catalogue rows are retained so historical tickets
// continue to resolve and the
// `/consumer/paralegal-services/non-judicial/criminal-record-search`
// slug still works for bookmarked links. The wizard switches between
// the two modes via a `fir_mode` radio on the first step.
const MERGED_FIR_LABEL = 'FIR & Criminal Record';
const MERGED_FIR_DESCRIPTION =
  'Get a copy of an FIR by number, or search criminal records by CNIC at the relevant police station.';

const tiles = nonJudicialFlows
  // Hide the standalone Criminal Record tile — its functionality now lives
  // inside the merged FIR tile's wizard (mode = "Search by CNIC").
  .filter((flow) => flow.key !== 'non_judicial_criminal_record_search')
  .map((flow) =>
    flow.key === 'non_judicial_copy_of_fir'
      ? { ...flow, label: MERGED_FIR_LABEL, description: MERGED_FIR_DESCRIPTION }
      : flow,
  );

export default function ConsumerNonJudicialServicesPage() {
  return (
    <ServicePicker
      flows={tiles}
      variant="consumer"
      basePath="/consumer/paralegal-services/non-judicial"
      title="Non-Judicial Services"
      subtitle="Choose the document or registry service you need."
    />
  );
}
