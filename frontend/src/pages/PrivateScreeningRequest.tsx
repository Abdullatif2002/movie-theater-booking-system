import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

export interface SubmittedScreeningRequest {
  request_id: number;
  organization_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  preferred_datetime: string;
  estimated_attendees: number;
  additional_requirements: string | null;
  status: string;
  created_at: string;
}

interface FieldErrors {
  organization_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  preferred_date?: string;
  preferred_time?: string;
  estimated_attendees?: string;
}

function PrivateScreeningRequest() {
  const [organizationName, setOrganizationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [estimatedAttendees, setEstimatedAttendees] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedRequest, setSubmittedRequest] =
    useState<SubmittedScreeningRequest | null>(null);

  const validateForm = (): FieldErrors => {
    const errors: FieldErrors = {};

    if (!organizationName.trim()) {
      errors.organization_name = "Organization name is required.";
    } else if (organizationName.trim().length > 150) {
      errors.organization_name =
        "Organization name cannot exceed 150 characters.";
    }

    if (!contactName.trim()) {
      errors.contact_name = "Contact person name is required.";
    } else if (contactName.trim().length > 100) {
      errors.contact_name = "Contact name cannot exceed 100 characters.";
    }

    const emailTrimmed = contactEmail.trim();
    if (!emailTrimmed) {
      errors.contact_email = "Contact email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      errors.contact_email = "Please enter a valid email address.";
    }

    const phoneTrimmed = contactPhone.trim();
    if (!phoneTrimmed) {
      errors.contact_phone = "Contact phone number is required.";
    } else if (phoneTrimmed.length > 50) {
      errors.contact_phone = "Phone number cannot exceed 50 characters.";
    }

    if (!preferredDate.trim()) {
      errors.preferred_date = "Preferred date is required.";
    }

    if (!preferredTime.trim()) {
      errors.preferred_time = "Preferred time is required.";
    }

    if (preferredDate.trim() && preferredTime.trim()) {
      const combined = new Date(`${preferredDate}T${preferredTime}`);
      if (Number.isNaN(combined.getTime())) {
        errors.preferred_date = "Please enter a valid date and time.";
      } else if (combined.getTime() <= Date.now()) {
        errors.preferred_date =
          "Preferred date and time must be in the future.";
      }
    }

    const attendeesNumber = Number(estimatedAttendees);
    if (!estimatedAttendees.trim()) {
      errors.estimated_attendees =
        "Estimated number of attendees is required.";
    } else if (
      !Number.isInteger(attendeesNumber) ||
      attendeesNumber <= 0
    ) {
      errors.estimated_attendees =
        "Estimated number of attendees must be a whole number greater than 0.";
    } else if (attendeesNumber > 1000) {
      errors.estimated_attendees =
        "Estimated number of attendees cannot exceed 1,000.";
    }

    return errors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");

    const errors = validateForm();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setSubmitError(
        "Please fix the highlighted required fields before submitting your request."
      );
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(
        "http://localhost:3000/api/private-screenings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_name: organizationName.trim(),
            contact_name: contactName.trim(),
            contact_email: contactEmail.trim(),
            contact_phone: contactPhone.trim(),
            preferred_date: preferredDate,
            preferred_time: preferredTime,
            preferred_datetime: `${preferredDate}T${preferredTime}`,
            estimated_attendees: Number(estimatedAttendees),
            additional_requirements: additionalRequirements.trim() || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to submit private screening request."
        );
      }

      setSubmittedRequest(data.request);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong while submitting your request."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setOrganizationName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setPreferredDate("");
    setPreferredTime("");
    setEstimatedAttendees("");
    setAdditionalRequirements("");
    setFieldErrors({});
    setSubmitError("");
    setSubmittedRequest(null);
  };

  return (
    <div className="min-h-screen bg-[#09090d] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <Link to="/" className="text-2xl font-black tracking-tighter">
            CINE<span className="text-red-500">MAX</span>
          </Link>

          <div className="flex items-center gap-6 text-sm font-semibold">
            <Link
              to="/staff/private-screenings"
              className="text-zinc-400 transition hover:text-white"
            >
              Staff Portal
            </Link>
            <Link
              to="/"
              className="text-zinc-400 transition hover:text-white"
            >
              ← Back to Movies
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-red-500">
          CINEMAX · Corporate & Group Events
        </p>

        <h1 className="mt-3 text-3xl font-black sm:text-5xl">
          Private Movie{" "}
          <span className="text-red-500">Screening Request</span>
        </h1>

        <p className="mt-4 text-sm leading-7 text-zinc-400 sm:text-base">
          Arrange an exclusive movie screening for your company, team, or
          organization. Complete the request form below and our events staff
          will coordinate your private cinema experience.
        </p>

        {submittedRequest ? (
          <section
            aria-live="polite"
            className="mt-8 rounded-2xl border border-emerald-500/30 bg-[#14141b] p-7 sm:p-10"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-3xl font-black text-emerald-400">
              ✓
            </div>

            <div className="mt-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">
                Request Submitted Successfully
              </p>

              <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                We have received your private screening request!
              </h2>

              <p className="mt-3 text-sm text-zinc-400">
                Your request has been saved and is now available for review by
                authorized CINEMAX staff.
              </p>
            </div>

            <div className="mt-7 rounded-xl bg-white/[0.04] p-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Request Reference ID
              </p>
              <p className="mt-1 text-3xl font-black text-white">
                #{submittedRequest.request_id}
              </p>
            </div>

            <div className="mt-6 space-y-3 border-t border-white/10 pt-6 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Organization</span>
                <span className="text-right font-semibold">
                  {submittedRequest.organization_name}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Contact Representative</span>
                <span className="text-right">
                  {submittedRequest.contact_name}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Contact Email</span>
                <span className="text-right">
                  {submittedRequest.contact_email}
                </span>
              </div>

              {submittedRequest.contact_phone && (
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-400">Contact Phone</span>
                  <span className="text-right">
                    {submittedRequest.contact_phone}
                  </span>
                </div>
              )}

              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Preferred Date & Time</span>
                <span className="text-right font-semibold text-red-400">
                  {new Date(
                    submittedRequest.preferred_datetime
                  ).toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Estimated Attendees</span>
                <span className="text-right font-semibold">
                  {submittedRequest.estimated_attendees} guests
                </span>
              </div>

              <div className="flex justify-between gap-4">
                <span className="text-zinc-400">Status</span>
                <span className="inline-flex items-center rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-yellow-300">
                  {submittedRequest.status}
                </span>
              </div>

              {submittedRequest.additional_requirements && (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-zinc-400">Additional Requirements</p>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-200">
                    {submittedRequest.additional_requirements}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 rounded-xl border border-white/15 bg-white/[0.05] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/[0.1]"
              >
                Submit Another Request
              </button>

              <Link
                to="/"
                className="flex-1 rounded-xl bg-red-600 px-6 py-3.5 text-center text-sm font-bold text-white transition hover:bg-red-500"
              >
                Back to Home
              </Link>
            </div>
          </section>
        ) : (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="mt-8 space-y-6 rounded-2xl border border-white/10 bg-[#14141b] p-6 sm:p-8"
          >
            {submitError && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300"
              >
                {submitError}
              </div>
            )}

            {/* Organization Details */}
            <div>
              <h2 className="text-lg font-bold text-white">
                Organization & Contact Details
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Tell us about your organization and who our events team should
                contact.
              </p>

              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="organization-name"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Organization Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="organization-name"
                    name="organization_name"
                    type="text"
                    placeholder="e.g. Nordic Tech Solutions Oy"
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 ${
                      fieldErrors.organization_name
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.organization_name && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.organization_name}
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="contact-name"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Contact Representative Name{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-name"
                    name="contact_name"
                    type="text"
                    placeholder="e.g. Anna Korhonen"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 ${
                      fieldErrors.contact_name
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.contact_name && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.contact_name}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="contact-email"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Contact Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-email"
                    name="contact_email"
                    type="email"
                    placeholder="e.g. anna.korhonen@company.fi"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 ${
                      fieldErrors.contact_email
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.contact_email && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.contact_email}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="contact-phone"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Contact Phone <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="contact-phone"
                    name="contact_phone"
                    type="tel"
                    placeholder="e.g. +358 40 123 4567"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 ${
                      fieldErrors.contact_phone
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.contact_phone && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.contact_phone}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Event Schedule & Capacity */}
            <div className="border-t border-white/10 pt-6">
              <h2 className="text-lg font-bold text-white">
                Event Schedule & Group Size
              </h2>
              <p className="mt-1 text-xs text-zinc-400">
                Select your preferred screening date, time, and estimated number
                of guests.
              </p>

              <div className="mt-4 grid gap-5 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="preferred-date"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Preferred Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="preferred-date"
                    name="preferred_date"
                    type="date"
                    value={preferredDate}
                    onChange={(e) => setPreferredDate(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition ${
                      fieldErrors.preferred_date
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.preferred_date && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.preferred_date}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="preferred-time"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Preferred Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="preferred-time"
                    name="preferred_time"
                    type="time"
                    value={preferredTime}
                    onChange={(e) => setPreferredTime(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition ${
                      fieldErrors.preferred_time
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.preferred_time && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.preferred_time}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="estimated-attendees"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
                  >
                    Estimated Attendees <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="estimated-attendees"
                    name="estimated_attendees"
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="e.g. 60"
                    value={estimatedAttendees}
                    onChange={(e) => setEstimatedAttendees(e.target.value)}
                    className={`w-full rounded-xl border bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 ${
                      fieldErrors.estimated_attendees
                        ? "border-red-500"
                        : "border-white/10 focus:border-red-500"
                    }`}
                  />
                  {fieldErrors.estimated_attendees && (
                    <p className="mt-1.5 text-xs text-red-400">
                      {fieldErrors.estimated_attendees}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Additional Requirements */}
            <div className="border-t border-white/10 pt-6">
              <label
                htmlFor="additional-requirements"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-300"
              >
                Additional Requirements (Optional)
              </label>
              <textarea
                id="additional-requirements"
                name="additional_requirements"
                rows={4}
                placeholder="Specify preferred movie title, catering or refreshments, presentation microphone/AV setup, accessibility accommodations, or other notes..."
                value={additionalRequirements}
                onChange={(e) => setAdditionalRequirements(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#09090d] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-red-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-red-600 px-6 py-4 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? "Submitting Request..."
                : "Submit Private Screening Request"}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}

export default PrivateScreeningRequest;
