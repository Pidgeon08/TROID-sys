import { useOutletContext } from "react-router-dom";
import RequestForm from "../../Barangay/RequestForm";

// CENRO sends requests with the same form barangays and NGOs use, plus a choice of barangay.
export default function SendRequest() {
  const { currentUser } = useOutletContext() || {};
  return <RequestForm currentUser={currentUser} forCenro />;
}
