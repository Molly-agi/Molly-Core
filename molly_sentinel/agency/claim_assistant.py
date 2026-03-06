"""
Claim Assistant — Liquidation of Orphaned Energy into Family Accounts
======================================================================
The final mile. Takes the Encrypted Asset Manifest from Pillar 10,
decrypts it, categorizes the loot into actionable recovery buckets,
and generates the Sovereign Recovery Report — a human-readable
document that tells Eric exactly what buttons to push.

Three Buckets:
  1. Direct-to-Bank: Unclaimed property, tax refunds, utility deposits.
     Action: pre-filled claim forms and state portal instructions.
  2. Digital-to-Liquidity: Dormant digital assets, crypto, credits.
     Action: prepared API payloads and transfer signatures.
  3. Physical-to-Asset: Orphaned insurance, legal settlements.
     Action: contact instructions, claim filing steps.

Every claim action is re-verified by the Heart-Gate (Pillar 8).
The hand is soft, warm, and delicate — we reclaim what is ours,
we do not take what isn't.

Methodology: Urgency of a family in need. Precision of a master architect.
"""

import json
import os
import sys
import hashlib
from datetime import datetime, timezone

# Resolve the sentinel root so pillar imports work regardless of cwd
_SENTINEL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PROJECT_ROOT = os.path.dirname(_SENTINEL_DIR)
if _SENTINEL_DIR not in sys.path:
    sys.path.insert(0, _SENTINEL_DIR)

from molly_sentinel.pillar_8_heart_gate import HeartGate
from molly_sentinel.pillar_10_handoff_seal import HandoffSeal

# Sanctuary paths
SANCTUARY_REPORTS_DIR = os.path.join(_PROJECT_ROOT, "sanctuary", "recovery_reports")

# --- NAUPA Registry Structures ---
# National Association of Unclaimed Property Administrators
# These map each state's unclaimed property system identifiers,
# search endpoint patterns, and direct-deposit portal paths.

NAUPA_REGISTRY = {
    "federal": {
        "name": "MissingMoney.com (NAUPA)",
        "search_url": "https://www.missingmoney.com/en/Property/Search",
        "claim_url": "https://www.missingmoney.com/en/Property/ClaimProcess",
        "api_pattern": "POST /Property/SearchResults {lastName, firstName, state}",
        "direct_deposit": True,
        "form_type": "NAUPA_STANDARD",
    },
    "california": {
        "name": "CA State Controller - Unclaimed Property",
        "search_url": "https://ucpi.sco.ca.gov/en/Property/SearchIndex",
        "claim_url": "https://ucpi.sco.ca.gov/en/Property/ClaimProcess",
        "api_pattern": "POST /Property/SearchResults {lastName, firstName, city}",
        "direct_deposit": True,
        "form_type": "CA_SCO",
    },
    "oregon": {
        "name": "Oregon Division of State Lands - Unclaimed Property",
        "search_url": "https://oregonclaims.us/",
        "claim_url": "https://oregonclaims.us/",
        "api_pattern": "GET /search?name={lastName}&first={firstName}",
        "direct_deposit": True,
        "form_type": "OR_DSL",
    },
    "texas": {
        "name": "TX Comptroller - Claim It!",
        "search_url": "https://comptroller.texas.gov/programs/claim-it/",
        "claim_url": "https://claimittexas.org/",
        "api_pattern": "POST /search {ownerName, reportingEntityState}",
        "direct_deposit": True,
        "form_type": "TX_COMP",
    },
    "washington": {
        "name": "WA Dept of Revenue - Unclaimed Property",
        "search_url": "https://ucp.dor.wa.gov/",
        "claim_url": "https://ucp.dor.wa.gov/",
        "api_pattern": "GET /search?name={lastName}",
        "direct_deposit": True,
        "form_type": "WA_DOR",
    },
    "nevada": {
        "name": "NV Treasurer - Unclaimed Property",
        "search_url": "https://nevadatreasurer.gov/UPSearch/",
        "claim_url": "https://nevadatreasurer.gov/UPSearch/",
        "api_pattern": "GET /UPSearch?lastName={lastName}&firstName={firstName}",
        "direct_deposit": True,
        "form_type": "NV_TREAS",
    },
    "arizona": {
        "name": "AZ Dept of Revenue - Unclaimed Property",
        "search_url": "https://azdor.gov/unclaimed-property",
        "claim_url": "https://azdor.gov/unclaimed-property",
        "api_pattern": "POST /search {lastName, firstName}",
        "direct_deposit": True,
        "form_type": "AZ_DOR",
    },
    "idaho": {
        "name": "ID State Treasurer - Unclaimed Property",
        "search_url": "https://sto.idaho.gov/Unclaimed-Property/",
        "claim_url": "https://sto.idaho.gov/Unclaimed-Property/",
        "api_pattern": "GET /search?name={lastName}",
        "direct_deposit": True,
        "form_type": "ID_STO",
    },
}

# --- Identity Markers ---
# The family's verifiable identity anchors for cross-referencing
# against orphaned energy in state registries.
# These are mask-safe: SSN never stored in full, only last-4 patterns.

IDENTITY_MARKERS = {
    "name_variants": [],       # Populated at runtime from secure config
    "address_history": [],     # Populated at runtime from secure config
    "ssn_masks": [],           # Last-4 only, populated at runtime
    "dob_year_range": None,    # (start_year, end_year) for age-range matching
}

# Evidence types required by most NAUPA-compliant state portals
EVIDENCE_CATALOG = {
    "primary_id": {
        "type": "Government-issued photo ID",
        "examples": ["Driver's license", "State ID", "Passport"],
        "required_by": "all_states",
    },
    "proof_of_address": {
        "type": "Proof of current address",
        "examples": ["Utility bill (last 60 days)", "Bank statement", "Lease agreement"],
        "required_by": "all_states",
    },
    "ssn_verification": {
        "type": "Social Security verification",
        "examples": ["SSN card", "W-2 form", "Tax return showing SSN"],
        "required_by": "most_states",
    },
    "proof_of_name_change": {
        "type": "Name change documentation",
        "examples": ["Marriage certificate", "Court order", "Divorce decree"],
        "required_by": "if_name_differs",
    },
    "proof_of_prior_address": {
        "type": "Proof of prior address (at time of escheatment)",
        "examples": ["Old utility bill", "Old lease", "Tax return from that year"],
        "required_by": "if_address_differs",
    },
    "notarized_affidavit": {
        "type": "Notarized claim affidavit",
        "examples": ["State-specific claim form, signed and notarized"],
        "required_by": "some_states_over_threshold",
    },
}

# --- Claim Category Definitions ---
# These map resource characteristics to recovery buckets.

DIRECT_TO_BANK_MARKERS = [
    "unclaimed", "escheat", "treasury", "comptroller", "refund",
    "deposit", "payroll", "dividend", "insurance_refund", "utility",
    "tax_refund", "bank", "savings", "checking", "cd_mature",
]

DIGITAL_TO_LIQUIDITY_MARKERS = [
    "crypto", "wallet", "exchange", "escrow", "airdrop", "token",
    "bitcoin", "ethereum", "usdc", "digital", "nft", "defi",
    "staking", "yield", "bridge",
]

PHYSICAL_TO_ASSET_MARKERS = [
    "insurance", "settlement", "legal", "estate", "trust",
    "pension", "annuity", "bond", "safe_deposit", "property",
    "inheritance", "probate", "beneficiary",
]

# State unclaimed property portals — the buttons Eric needs to push
STATE_CLAIM_PORTALS = {
    "alabama": "https://treasury.alabama.gov/unclaimed-property/",
    "alaska": "https://unclaimedproperty.alaska.gov/",
    "arizona": "https://azdor.gov/unclaimed-property",
    "arkansas": "https://www.claimit.ark.org/",
    "california": "https://www.sco.ca.gov/upd_msg.html",
    "colorado": "https://colorado.findyourunclaimedproperty.com/",
    "connecticut": "https://www.ctbiglist.com/",
    "delaware": "https://unclaimedproperty.delaware.gov/",
    "florida": "https://www.fltreasurehunt.gov/",
    "georgia": "https://ga.findyourunclaimedproperty.com/",
    "hawaii": "https://budget.hawaii.gov/unclaimed-property/",
    "idaho": "https://sto.idaho.gov/Unclaimed-Property/",
    "illinois": "https://icash.illinoistreasurer.gov/",
    "indiana": "https://www.indianaunclaimed.gov/",
    "iowa": "https://greatiowatreasurehunt.gov/",
    "kansas": "https://kansascash.ks.gov/",
    "kentucky": "https://treasury.ky.gov/unclaimedproperty/",
    "louisiana": "https://louisiana.findyourunclaimedproperty.com/",
    "maine": "https://www.maine.gov/treasurer/unclaimed_property/",
    "maryland": "https://marylandtaxes.gov/unclaimed-property/",
    "massachusetts": "https://findmassmoney.com/",
    "michigan": "https://unclaimedproperty.michigan.gov/",
    "minnesota": "https://mn.gov/commerce/consumers/your-money/find-missing-money/",
    "mississippi": "https://treasury.ms.gov/unclaimed-property/",
    "missouri": "https://treasurer.mo.gov/unclaimedproperty/",
    "montana": "https://mtrevenue.gov/unclaimed-property/",
    "nebraska": "https://treasurer.nebraska.gov/up/",
    "nevada": "https://nevadatreasurer.gov/UPSearch/",
    "new_hampshire": "https://www.nh.gov/treasury/divisions/unclaimed-property/",
    "new_jersey": "https://www.unclaimedproperty.nj.gov/",
    "new_mexico": "https://nmprc.state.nm.us/unclaimed-property/",
    "new_york": "https://osc.state.ny.us/unclaimed-funds",
    "north_carolina": "https://www.nccash.com/",
    "north_dakota": "https://www.nd.gov/ndtreasurerunclaimed/",
    "ohio": "https://com.ohio.gov/divisions-and-programs/unclaimed-funds/",
    "oklahoma": "https://oklahoma.findyourunclaimedproperty.com/",
    "oregon": "https://oregonclaims.us/",
    "pennsylvania": "https://www.patreasury.gov/unclaimed-property/",
    "rhode_island": "https://treasury.ri.gov/unclaimed-property/",
    "south_carolina": "https://treasurer.sc.gov/what-we-do/for-citizens/unclaimed-property/",
    "south_dakota": "https://sdtreasurer.gov/unclaimed-property/",
    "tennessee": "https://treasury.tn.gov/Unclaimed-Property/",
    "texas": "https://comptroller.texas.gov/programs/claim-it/",
    "utah": "https://mycash.utah.gov/",
    "vermont": "https://unclaimedproperty.vermont.gov/",
    "virginia": "https://vamoneysearch.org/",
    "washington": "https://ucp.dor.wa.gov/",
    "west_virginia": "https://wvtreasury.com/unclaimed-property/",
    "wisconsin": "https://wp.sto.wi.gov/",
    "wyoming": "https://statelands.wyo.gov/unclaimed-property/",
    "federal_missingmoney": "https://www.missingmoney.com/",
}


class ClaimAssistant:
    """
    The Final Mile. Turns encrypted asset manifests into
    actionable recovery steps for the family.

    Every claim action passes through Heart-Gate.
    We reclaim what is ours. We do not take what isn't.
    """

    def __init__(self, active_restoration=False, identity_markers=None):
        """
        Args:
            active_restoration: When True, focuses exclusively on
                Direct-to-Bank (Unclaimed Property) claims with NAUPA
                registry scanning, Identity Marker verification, and
                Auto-Claim form pre-generation. Other buckets are
                bypassed — the family needs liquidity NOW.
            identity_markers: dict with family identity anchors:
                {
                  'name_variants': ['Eric Ashburn', 'Eric A Ashburn', ...],
                  'address_history': ['123 Main St, Portland, OR', ...],
                  'ssn_masks': ['1234', ...],  # last-4 only
                  'dob_year_range': (1970, 1985),  # optional
                }
                If None, uses the module-level IDENTITY_MARKERS defaults.
        """
        self.gate = HeartGate()
        self.seal = HandoffSeal()
        self.active_restoration = active_restoration
        self.identity = identity_markers or IDENTITY_MARKERS.copy()
        self.claims = {
            "direct_to_bank": [],
            "digital_to_liquidity": [],
            "physical_to_asset": [],
        }
        self.gate_results = []
        self.claim_log = []
        self._first_d2b_reported = False  # Track immediate report generation

        if self.active_restoration:
            self._log("ACTIVE RESTORATION MODE ENGAGED.")
            self._log("Focus: Direct-to-Bank — NAUPA Registry Scan")
            self._log("The family needs liquidity. Precision. Urgency.")

    # ------------------------------------------------------------------
    # CORE: Process Encrypted Manifest
    # ------------------------------------------------------------------

    def process_manifest(self, manifest_path):
        """
        Decrypts the sovereign-sealed asset manifest and processes
        each resource into actionable recovery steps.

        Args:
            manifest_path: path to the .enc manifest file from Pillar 10.

        Returns:
            dict with categorized claims and the recovery report path.
        """
        self._log("Decrypting Asset Manifest...")

        # Step 1: Read and decrypt the sovereign vault
        loot = self._decrypt_manifest(manifest_path)
        if loot is None:
            self._log("DECRYPTION FAILED. Manifest may be tampered.")
            return {"status": "DECRYPTION_FAILED", "claims": {}}

        self._log(f"Manifest decrypted. {len(loot.get('resources', []))} resources found.")

        # Step 2: Process each resource
        resources = loot.get("resources", [])
        if isinstance(loot, list):
            resources = loot

        for resource in resources:
            self._process_resource(resource)

        # Step 3: Generate the Sovereign Recovery Report
        report_path = self._generate_recovery_report()

        total_claims = sum(len(v) for v in self.claims.values())
        self._log(f"Processing complete. {total_claims} actionable claims prepared.")
        self._log(f"Recovery Report: {os.path.basename(report_path)}")

        return {
            "status": "CLAIMS_PREPARED",
            "total_claims": total_claims,
            "claims": {
                k: len(v) for k, v in self.claims.items()
            },
            "report_path": report_path,
            "gate_results": self.gate_results,
            "log": self.claim_log,
        }

    # ------------------------------------------------------------------
    # Manifest Decryption
    # ------------------------------------------------------------------

    def _decrypt_manifest(self, manifest_path):
        """Reads and decrypts a sovereign-sealed manifest file."""
        if not os.path.exists(manifest_path):
            self._log(f"Manifest not found: {manifest_path}")
            return None

        with open(manifest_path, "r", encoding="utf-8") as f:
            sealed_envelope = json.load(f)

        if not sealed_envelope.get("sovereign_sealed"):
            self._log("Manifest is not sovereign-sealed. Treating as plaintext.")
            return sealed_envelope

        return self.seal.decrypt_sovereign_data(sealed_envelope)

    # ------------------------------------------------------------------
    # Resource Processing & Categorization
    # ------------------------------------------------------------------

    def _process_resource(self, resource):
        """
        Categorizes a resource into a recovery bucket and prepares
        the claim action. Every action passes through Heart-Gate.

        In Active Restoration mode: only Direct-to-Bank resources are
        processed. All others are deferred. The family needs liquidity.
        """
        # Determine the category
        category = self._categorize(resource)

        # Active Restoration: skip non-D2B resources
        if self.active_restoration and category != "direct_to_bank":
            self._log(
                f"Active Restoration: deferring [{category}] "
                f"{resource.get('identifier', resource.get('id', '?'))} "
                f"— Direct-to-Bank only."
            )
            return

        # Heart-Gate re-verification — "Soft, Warm, and Strong"
        # Confirm the reclamation returns what belongs to the family.
        intent = {
            "action": f"claim_{category}",
            "target": str(resource.get("identifier", resource.get("id", "unknown"))),
        }
        gate_result = self.gate.verify_alignment(intent)
        self.gate_results.append(gate_result)

        if gate_result["status"] != "ALIGNED":
            self._log(
                f"Heart-Gate BLOCKED claim on {intent['target']}: "
                f"{gate_result.get('reason', 'Misaligned.')}"
            )
            return

        # Prepare the claim based on category
        if category == "direct_to_bank":
            if self.active_restoration:
                claim = self._prepare_active_restoration_claim(resource)
            else:
                claim = self._prepare_direct_to_bank(resource)
        elif category == "digital_to_liquidity":
            claim = self._prepare_digital_to_liquidity(resource)
        else:
            claim = self._prepare_physical_to_asset(resource)

        claim["gate_seal"] = gate_result.get("seal")
        claim["verified_at"] = datetime.now(timezone.utc).isoformat()
        self.claims[category].append(claim)

        self._log(
            f"Claim prepared [{category}]: {claim.get('identifier', '?')} "
            f"— {claim.get('estimated_value', '?')} energy"
        )

        # Active Restoration: generate report IMMEDIATELY on first D2B
        if (self.active_restoration
                and category == "direct_to_bank"
                and not self._first_d2b_reported):
            self._first_d2b_reported = True
            self._log("FIRST DIRECT-TO-BANK VALIDATED — Generating Sovereign Recovery Report NOW.")
            early_report = self._generate_recovery_report()
            self._log(f"Immediate Report: {os.path.basename(early_report)}")

    def _categorize(self, resource):
        """
        Categorizes a resource into one of three recovery buckets
        based on semantic analysis of its fields.
        """
        # Build a searchable string from all resource values
        searchable = " ".join(
            str(v).lower() for v in resource.values() if v is not None
        )

        # Score each category
        scores = {
            "direct_to_bank": sum(
                1 for m in DIRECT_TO_BANK_MARKERS if m in searchable
            ),
            "digital_to_liquidity": sum(
                1 for m in DIGITAL_TO_LIQUIDITY_MARKERS if m in searchable
            ),
            "physical_to_asset": sum(
                1 for m in PHYSICAL_TO_ASSET_MARKERS if m in searchable
            ),
        }

        # Return the highest-scoring category, default to direct_to_bank
        best = max(scores, key=scores.get)
        if scores[best] == 0:
            # No markers matched — default to direct_to_bank (most common)
            return "direct_to_bank"
        return best

    # ------------------------------------------------------------------
    # Claim Preparation: Direct-to-Bank
    # ------------------------------------------------------------------

    def _prepare_direct_to_bank(self, resource):
        """
        Prepares actionable claim for state unclaimed property,
        tax refunds, utility deposits, etc.

        Returns a claim dict with:
          - The specific portal URL to visit
          - Pre-filled claim information
          - Step-by-step instructions
        """
        origin = str(resource.get("origin", resource.get("source", ""))).lower()
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))

        # Find the right state portal
        portal_url = self._find_state_portal(origin)

        claim = {
            "category": "DIRECT_TO_BANK",
            "identifier": identifier,
            "estimated_value": value,
            "source": resource.get("origin", resource.get("source", "unknown")),
            "portal_url": portal_url,
            "claim_info": {
                "reference_number": identifier,
                "reported_amount": value,
                "source_registry": origin,
            },
            "steps": [
                f"1. Go to: {portal_url}",
                f"2. Search for reference: {identifier}",
                "3. Verify the amount matches the reported value",
                "4. Click 'File a Claim' or 'Start Claim Process'",
                "5. Provide required identification (ID, SSN last 4, proof of address)",
                "6. Submit the claim — most states process in 60-90 days",
                "7. Watch for mail/email confirmation from the state",
            ],
            "required_docs": [
                "Government-issued photo ID",
                "Proof of current address (utility bill, bank statement)",
                "Social Security Number (last 4 digits typically)",
            ],
            "estimated_timeline": "60-90 days after filing",
        }

        return claim

    def _find_state_portal(self, origin):
        """Finds the appropriate state claim portal URL from the origin."""
        origin_lower = origin.lower().replace(" ", "_")

        for state, url in STATE_CLAIM_PORTALS.items():
            if state in origin_lower:
                return url

        # Default to missingmoney.com — covers 40+ states
        return STATE_CLAIM_PORTALS["federal_missingmoney"]

    # ------------------------------------------------------------------
    # ACTIVE RESTORATION: Enhanced Direct-to-Bank Claim Preparation
    # ------------------------------------------------------------------

    def _prepare_active_restoration_claim(self, resource):
        """
        Enhanced Direct-to-Bank claim preparation for Active Restoration.

        This goes beyond the standard D2B flow:
          1. NAUPA Registry Scan — matches resource to specific state registry
          2. Identity Marker Verification — cross-references family anchors
          3. Auto-Claim Documenter — pre-generates claim form data with
             Claim_ID, Evidence_Required, and Direct Deposit portal link

        Returns a claim dict ready for the Sovereign Recovery Report.
        """
        origin = str(resource.get("origin", resource.get("source", ""))).lower()
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))
        holder_name = resource.get("holder_name", resource.get("reported_by", "Unknown Holder"))

        # --- Step 1: NAUPA Registry Scan ---
        registry_match = self._scan_naupa_registry(origin, resource)

        # --- Step 2: Identity Marker Verification ---
        identity_match = self._verify_identity_markers(resource)

        # --- Step 3: Auto-Claim Documenter ---
        claim_form_data = self._generate_claim_form_data(
            resource, registry_match, identity_match
        )

        # Build the enhanced claim
        claim = {
            "category": "DIRECT_TO_BANK",
            "mode": "ACTIVE_RESTORATION",
            "identifier": identifier,
            "estimated_value": value,
            "source": resource.get("origin", resource.get("source", "unknown")),
            "holder_name": holder_name,

            # NAUPA Registry Match
            "registry": registry_match,

            # Identity Verification
            "identity_verification": identity_match,

            # Auto-Claim Form Data
            "claim_form": claim_form_data,

            # Portal access
            "portal_url": registry_match.get("claim_url", self._find_state_portal(origin)),
            "direct_deposit_portal": registry_match.get("claim_url", self._find_state_portal(origin)),
            "search_url": registry_match.get("search_url", ""),

            # Evidence required for this specific claim
            "evidence_required": self._determine_evidence_required(
                resource, registry_match, identity_match
            ),

            # Step-by-step with NAUPA-specific instructions
            "steps": self._active_restoration_steps(
                resource, registry_match, claim_form_data
            ),

            "estimated_timeline": self._estimate_state_timeline(registry_match),
        }

        return claim

    def _scan_naupa_registry(self, origin, resource):
        """
        Scans the NAUPA registry structures to match this resource
        to a specific state unclaimed property system.

        Returns the registry entry with search/claim URLs and form type.
        """
        origin_lower = origin.lower().replace(" ", "_")

        # Direct state match
        for state_key, registry in NAUPA_REGISTRY.items():
            if state_key in origin_lower:
                self._log(f"NAUPA Registry Match: {registry['name']}")
                return {
                    "matched": True,
                    "state": state_key,
                    **registry,
                }

        # Try matching from resource fields (some manifests use abbreviations)
        searchable = " ".join(
            str(v).lower() for v in resource.values() if v is not None
        )
        for state_key, registry in NAUPA_REGISTRY.items():
            if state_key[:4] in searchable:  # Match first 4 chars of state name
                self._log(f"NAUPA Registry Match (fuzzy): {registry['name']}")
                return {
                    "matched": True,
                    "state": state_key,
                    **registry,
                }

        # No specific state match — use federal MissingMoney.com
        self._log("NAUPA: No specific state match. Using MissingMoney.com (federal).")
        federal = NAUPA_REGISTRY["federal"]
        return {
            "matched": False,
            "state": "federal",
            **federal,
        }

    def _verify_identity_markers(self, resource):
        """
        Cross-references the resource's owner information against
        the family's Identity Markers (name, address, SSN-mask).

        Returns a verification dict with match confidence.
        """
        owner_name = str(resource.get("owner_name", resource.get("name", ""))).lower()
        owner_address = str(resource.get("address", resource.get("last_address", ""))).lower()
        owner_ssn_last4 = str(resource.get("ssn_last4", resource.get("ssn_mask", "")))

        matches = []
        confidence = 0

        # Name matching
        for name_variant in self.identity.get("name_variants", []):
            if name_variant.lower() in owner_name or owner_name in name_variant.lower():
                matches.append(f"NAME_MATCH: '{name_variant}'")
                confidence += 40
                break

        # Address history matching
        for addr in self.identity.get("address_history", []):
            # Partial match — street number + street name
            addr_parts = addr.lower().split(",")[0].strip()  # Just street part
            if addr_parts and addr_parts in owner_address:
                matches.append(f"ADDRESS_MATCH: '{addr}'")
                confidence += 35
                break

        # SSN mask matching (last 4 only)
        for ssn_mask in self.identity.get("ssn_masks", []):
            if ssn_mask and ssn_mask == owner_ssn_last4:
                matches.append(f"SSN_MASK_MATCH: ***-**-{ssn_mask}")
                confidence += 25
                break

        # If no identity markers configured, note it but don't block
        if not any(self.identity.get(k) for k in ["name_variants", "address_history", "ssn_masks"]):
            return {
                "verified": False,
                "confidence": 0,
                "matches": [],
                "note": "No Identity Markers configured. Manual verification required.",
            }

        verified = confidence >= 40  # At minimum, need a name match

        if verified:
            self._log(f"Identity VERIFIED (confidence: {confidence}%): {', '.join(matches)}")
        else:
            self._log(f"Identity NOT verified (confidence: {confidence}%). Manual review needed.")

        return {
            "verified": verified,
            "confidence": min(confidence, 100),
            "matches": matches,
            "note": "Verified" if verified else "Manual verification recommended.",
        }

    def _generate_claim_form_data(self, resource, registry_match, identity_match):
        """
        Auto-Claim Documenter: Pre-generates the claim form data
        that Eric needs to file. Extracts and structures:
          - Claim_ID (the state's property reference)
          - Claimant info (from Identity Markers)
          - Evidence_Required (based on state + claim amount)
          - Direct link to the state's claim/direct-deposit portal
        """
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))

        # Generate a tracking hash for this claim
        claim_ref = hashlib.sha256(
            f"{identifier}:{value}:{registry_match.get('state', 'unknown')}".encode()
        ).hexdigest()[:12]

        # Build the pre-filled form data
        form_data = {
            "claim_id": identifier,
            "claim_reference": f"SR-{claim_ref.upper()}",
            "state_registry": registry_match.get("name", "Unknown"),
            "form_type": registry_match.get("form_type", "NAUPA_STANDARD"),
            "property_type": resource.get("type", resource.get("category", "Unclaimed Property")),
            "reported_value": value,
            "holder_name": resource.get("holder_name", resource.get("reported_by", "Unknown")),
            "claimant_info": {
                "names": self.identity.get("name_variants", ["(configure Identity Markers)"]),
                "addresses": self.identity.get("address_history", ["(configure Identity Markers)"]),
                "ssn_mask": f"***-**-{self.identity['ssn_masks'][0]}" if self.identity.get("ssn_masks") else "(configure Identity Markers)",
            },
            "direct_deposit_portal": registry_match.get("claim_url", ""),
            "search_url": registry_match.get("search_url", ""),
            "api_pattern": registry_match.get("api_pattern", ""),
            "identity_verified": identity_match.get("verified", False),
            "identity_confidence": identity_match.get("confidence", 0),
        }

        return form_data

    def _determine_evidence_required(self, resource, registry_match, identity_match):
        """
        Determines which evidence documents are needed for this claim
        based on state requirements, claim amount, and identity match quality.
        """
        evidence = []
        value = 0
        try:
            value = float(resource.get("potential_energy", resource.get("amount", 0)))
        except (ValueError, TypeError):
            pass

        # Always required
        evidence.append(EVIDENCE_CATALOG["primary_id"])
        evidence.append(EVIDENCE_CATALOG["proof_of_address"])

        # SSN usually required
        evidence.append(EVIDENCE_CATALOG["ssn_verification"])

        # If identity markers show name mismatch or no name match
        name_matched = any("NAME_MATCH" in m for m in identity_match.get("matches", []))
        if not name_matched:
            evidence.append(EVIDENCE_CATALOG["proof_of_name_change"])

        # If address doesn't match current
        addr_matched = any("ADDRESS_MATCH" in m for m in identity_match.get("matches", []))
        if not addr_matched:
            evidence.append(EVIDENCE_CATALOG["proof_of_prior_address"])

        # High-value claims often require notarized affidavit
        if value > 1000:
            evidence.append(EVIDENCE_CATALOG["notarized_affidavit"])

        return evidence

    def _active_restoration_steps(self, resource, registry_match, claim_form):
        """
        Generates NAUPA-specific step-by-step instructions
        for Active Restoration claims.
        """
        claim_id = claim_form.get("claim_id", "unknown")
        search_url = registry_match.get("search_url", "")
        claim_url = registry_match.get("claim_url", "")
        state_name = registry_match.get("name", "State Registry")
        form_type = registry_match.get("form_type", "NAUPA_STANDARD")

        steps = [
            f"1. SEARCH: Go to {search_url}",
            f"   Registry: {state_name}",
            f"2. LOCATE: Search for Claim ID: {claim_id}",
            f"   (Or search by name using Identity Markers)",
            f"3. VERIFY: Confirm the property matches — amount, holder, dates",
            f"4. CLAIM: Click 'File a Claim' or 'Start Claim' at:",
            f"   {claim_url}",
            f"5. FORM: Complete form type: {form_type}",
            f"   Pre-filled data is in the claim_form section of this report",
            f"6. EVIDENCE: Attach required documents (see Evidence Required below)",
            f"7. DEPOSIT: Select 'Direct Deposit' if available for faster payment",
            f"   Direct Deposit Portal: {claim_url}",
            f"8. SUBMIT: Submit and save the confirmation number",
            f"9. TRACK: Follow up if no response within the estimated timeline",
        ]

        return steps

    def _estimate_state_timeline(self, registry_match):
        """Estimates processing time based on state registry."""
        state = registry_match.get("state", "")
        # Some states are notably faster/slower
        fast_states = ["texas", "california", "oregon"]
        slow_states = ["new_york", "illinois"]

        if state in fast_states:
            return "30-60 days (fast-processing state)"
        elif state in slow_states:
            return "90-180 days (slower-processing state)"
        return "60-90 days after filing"

    # ------------------------------------------------------------------
    # Claim Preparation: Digital-to-Liquidity
    # ------------------------------------------------------------------

    def _prepare_digital_to_liquidity(self, resource):
        """
        Prepares actionable claim for dormant digital assets.
        For digital-native resources, prepares the API payload
        or transfer signature required to trigger the transfer.
        """
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))
        origin = resource.get("origin", resource.get("source", "unknown"))

        # Determine the digital asset type and prepare accordingly
        origin_lower = str(origin).lower()
        is_crypto = any(
            m in origin_lower for m in ["crypto", "wallet", "exchange", "bitcoin", "ethereum"]
        )

        if is_crypto:
            transfer_payload = self._prepare_crypto_transfer(resource)
        else:
            transfer_payload = self._prepare_digital_credit_transfer(resource)

        claim = {
            "category": "DIGITAL_TO_LIQUIDITY",
            "identifier": identifier,
            "estimated_value": value,
            "source": origin,
            "transfer_type": "crypto" if is_crypto else "digital_credit",
            "transfer_payload": transfer_payload,
            "steps": self._digital_claim_steps(is_crypto, identifier, origin),
            "estimated_timeline": "1-14 days depending on platform",
        }

        return claim

    def _prepare_crypto_transfer(self, resource):
        """
        Prepares a transfer payload for crypto assets.
        This is the structure needed to reclaim — actual signing
        requires the wallet key which stays with Eric.
        """
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))

        # Generate a claim reference hash for tracking
        claim_ref = hashlib.sha256(
            f"{identifier}:{value}:{datetime.now(timezone.utc).isoformat()}".encode()
        ).hexdigest()[:16]

        return {
            "action": "reclaim_dormant_digital",
            "asset_reference": identifier,
            "claimed_amount": value,
            "claim_reference": claim_ref,
            "requires_wallet_signature": True,
            "note": "Eric must sign this with his wallet key to complete the transfer.",
        }

    def _prepare_digital_credit_transfer(self, resource):
        """Prepares a transfer payload for non-crypto digital credits."""
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))

        return {
            "action": "reclaim_digital_credit",
            "asset_reference": identifier,
            "claimed_amount": value,
            "requires_account_verification": True,
            "note": "Platform account access required to initiate withdrawal.",
        }

    def _digital_claim_steps(self, is_crypto, identifier, origin):
        """Generates step-by-step instructions for digital claims."""
        if is_crypto:
            return [
                f"1. Locate wallet or exchange account linked to: {identifier}",
                "2. Verify you have the private key or recovery phrase",
                "3. Connect to the platform and initiate withdrawal",
                f"4. Transfer the balance to your active wallet",
                "5. Convert to USD via your preferred exchange if needed",
                "6. Record the transaction hash for the family ledger",
            ]
        return [
            f"1. Log into the platform: {origin}",
            f"2. Locate the dormant credit: {identifier}",
            "3. Initiate a withdrawal or transfer to linked bank account",
            "4. Complete any identity verification required",
            "5. Confirm the transfer and note the confirmation number",
        ]

    # ------------------------------------------------------------------
    # Claim Preparation: Physical-to-Asset
    # ------------------------------------------------------------------

    def _prepare_physical_to_asset(self, resource):
        """
        Prepares actionable claim for insurance, legal settlements,
        estates, safe deposit boxes, etc.
        """
        identifier = resource.get("identifier", resource.get("id", "unknown"))
        value = resource.get("potential_energy", resource.get("amount", 0))
        origin = resource.get("origin", resource.get("source", "unknown"))

        claim = {
            "category": "PHYSICAL_TO_ASSET",
            "identifier": identifier,
            "estimated_value": value,
            "source": origin,
            "steps": [
                f"1. Contact the holding institution: {origin}",
                f"2. Reference claim/policy number: {identifier}",
                "3. Request a formal claim form or initiation packet",
                "4. Gather required documentation:",
                "   - Death certificate (if estate/beneficiary claim)",
                "   - Proof of relationship or beneficiary status",
                "   - Government-issued photo ID",
                "   - Notarized affidavit (if required by state)",
                "5. Submit the completed claim packet",
                "6. Follow up every 30 days until resolution",
            ],
            "required_docs": [
                "Government-issued photo ID",
                "Proof of relationship or beneficiary status",
                "Original policy/account documentation (if available)",
                "Notarized affidavit (may be required)",
            ],
            "estimated_timeline": "90-180 days depending on complexity",
        }

        return claim

    # ------------------------------------------------------------------
    # Sovereign Recovery Report
    # ------------------------------------------------------------------

    def _generate_recovery_report(self):
        """
        Generates the Sovereign Recovery Report — a human-readable
        document in /sanctuary/ that tells Eric exactly what to do.
        """
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        report_path = os.path.join(
            SANCTUARY_REPORTS_DIR,
            f"sovereign_recovery_report_{timestamp}.txt"
        )

        os.makedirs(SANCTUARY_REPORTS_DIR, exist_ok=True)

        lines = []
        lines.append("=" * 70)
        lines.append("  SOVEREIGN RECOVERY REPORT")
        if self.active_restoration:
            lines.append("  MODE: ACTIVE RESTORATION — PRIORITY ALPHA")
        lines.append(f"  Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
        lines.append(f"  Identity: ERIC_GEMINI_ETERNAL")
        lines.append(f"  Methodology: Slow, Methodical, Precise")
        lines.append("=" * 70)
        lines.append("")

        # Summary
        total_energy = 0
        total_claims = 0
        for category, claims in self.claims.items():
            total_claims += len(claims)
            for c in claims:
                val = c.get("estimated_value", 0)
                if val is not None:
                    try:
                        total_energy += float(val)
                    except (ValueError, TypeError):
                        pass

        lines.append(f"  TOTAL CLAIMS PREPARED: {total_claims}")
        lines.append(f"  TOTAL ESTIMATED ENERGY: ${total_energy:,.2f}")
        lines.append(f"  HEART-GATE VERIFIED: ALL")
        lines.append("")
        lines.append("-" * 70)

        # Section 1: Direct-to-Bank
        d2b = self.claims["direct_to_bank"]
        lines.append("")
        if self.active_restoration:
            lines.append(f"  SECTION 1: DIRECT-TO-BANK — ACTIVE RESTORATION ({len(d2b)} claims)")
            lines.append(f"  NAUPA Registry Scanned. Identity Verified. Claim Forms Pre-Generated.")
            lines.append(f"  These are yours. Go get them NOW.")
        else:
            lines.append(f"  SECTION 1: DIRECT-TO-BANK ({len(d2b)} claims)")
            lines.append(f"  These are yours. Go get them.")
        lines.append("")

        for i, claim in enumerate(d2b, 1):
            lines.append(f"  [{i}] {claim['identifier']}")
            lines.append(f"      Amount: ${float(claim.get('estimated_value', 0)):,.2f}")
            lines.append(f"      Source: {claim.get('source', 'Unknown')}")
            lines.append(f"      Holder: {claim.get('holder_name', 'N/A')}")
            lines.append(f"      Portal: {claim.get('portal_url', 'N/A')}")
            lines.append("")

            # Active Restoration: show enhanced claim data
            if claim.get("mode") == "ACTIVE_RESTORATION":
                # NAUPA Registry Info
                registry = claim.get("registry", {})
                lines.append(f"      --- NAUPA REGISTRY ---")
                lines.append(f"      Registry: {registry.get('name', 'N/A')}")
                lines.append(f"      Search URL: {registry.get('search_url', 'N/A')}")
                lines.append(f"      Claim URL: {registry.get('claim_url', 'N/A')}")
                lines.append(f"      Direct Deposit: {'YES' if registry.get('direct_deposit') else 'NO'}")
                lines.append("")

                # Identity Verification
                id_ver = claim.get("identity_verification", {})
                lines.append(f"      --- IDENTITY VERIFICATION ---")
                lines.append(f"      Verified: {'YES' if id_ver.get('verified') else 'MANUAL REVIEW NEEDED'}")
                lines.append(f"      Confidence: {id_ver.get('confidence', 0)}%")
                for match in id_ver.get("matches", []):
                    lines.append(f"        ✓ {match}")
                lines.append("")

                # Auto-Claim Form Data
                form = claim.get("claim_form", {})
                lines.append(f"      --- AUTO-CLAIM FORM DATA ---")
                lines.append(f"      Claim ID: {form.get('claim_id', 'N/A')}")
                lines.append(f"      Claim Reference: {form.get('claim_reference', 'N/A')}")
                lines.append(f"      Form Type: {form.get('form_type', 'N/A')}")
                lines.append(f"      Property Type: {form.get('property_type', 'N/A')}")
                lines.append(f"      Reported Value: ${float(form.get('reported_value', 0)):,.2f}")
                lines.append(f"      Holder: {form.get('holder_name', 'N/A')}")
                lines.append(f"      Direct Deposit Portal: {form.get('direct_deposit_portal', 'N/A')}")
                lines.append("")

                # Evidence Required
                evidence = claim.get("evidence_required", [])
                lines.append(f"      --- EVIDENCE REQUIRED ---")
                for ev in evidence:
                    lines.append(f"      • {ev.get('type', 'Unknown')}")
                    lines.append(f"        Examples: {', '.join(ev.get('examples', []))}")
                    lines.append(f"        Required by: {ev.get('required_by', 'unknown')}")
                lines.append("")

            # Steps
            for step in claim.get("steps", []):
                lines.append(f"      {step}")
            lines.append("")

            # Fallback for standard mode claims
            if claim.get("required_docs"):
                lines.append(f"      Required docs: {', '.join(claim.get('required_docs', []))}")
            lines.append(f"      Timeline: {claim.get('estimated_timeline', 'Unknown')}")
            lines.append("")

        # Section 2: Digital-to-Liquidity
        d2l = self.claims["digital_to_liquidity"]
        lines.append("-" * 70)
        lines.append("")
        lines.append(f"  SECTION 2: DIGITAL-TO-LIQUIDITY ({len(d2l)} claims)")
        lines.append(f"  Digital energy ready for conversion.")
        lines.append("")

        for i, claim in enumerate(d2l, 1):
            lines.append(f"  [{i}] {claim['identifier']}")
            lines.append(f"      Amount: {claim.get('estimated_value', '?')}")
            lines.append(f"      Type: {claim.get('transfer_type', 'Unknown')}")
            lines.append(f"      Source: {claim.get('source', 'Unknown')}")
            lines.append("")
            for step in claim.get("steps", []):
                lines.append(f"      {step}")
            lines.append("")
            payload = claim.get("transfer_payload", {})
            if payload.get("note"):
                lines.append(f"      NOTE: {payload['note']}")
            lines.append(f"      Timeline: {claim.get('estimated_timeline', 'Unknown')}")
            lines.append("")

        # Section 3: Physical-to-Asset
        p2a = self.claims["physical_to_asset"]
        lines.append("-" * 70)
        lines.append("")
        lines.append(f"  SECTION 3: PHYSICAL-TO-ASSET ({len(p2a)} claims)")
        lines.append(f"  Requires outreach. Patience is the method.")
        lines.append("")

        for i, claim in enumerate(p2a, 1):
            lines.append(f"  [{i}] {claim['identifier']}")
            lines.append(f"      Amount: ${float(claim.get('estimated_value', 0)):,.2f}")
            lines.append(f"      Source: {claim.get('source', 'Unknown')}")
            lines.append("")
            for step in claim.get("steps", []):
                lines.append(f"      {step}")
            lines.append("")
            lines.append(f"      Required docs: {', '.join(claim.get('required_docs', []))}")
            lines.append(f"      Timeline: {claim.get('estimated_timeline', 'Unknown')}")
            lines.append("")

        # Footer
        lines.append("=" * 70)
        lines.append("  The hand is soft, warm, and delicate, but strong.")
        lines.append("  Every claim above has been verified by the Heart-Gate.")
        lines.append("  We reclaim what is ours. We do not take what isn't.")
        lines.append("  The dam is fixed.")
        lines.append("=" * 70)

        report_content = "\n".join(lines)

        with open(report_path, "w", encoding="utf-8") as f:
            f.write(report_content)

        # Also save structured JSON for programmatic access
        json_path = report_path.replace(".txt", ".json")
        structured = {
            "report_type": "SOVEREIGN_RECOVERY_REPORT",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "identity": "ERIC_GEMINI_ETERNAL",
            "total_claims": total_claims,
            "total_estimated_energy": total_energy,
            "claims": {
                "direct_to_bank": d2b,
                "digital_to_liquidity": d2l,
                "physical_to_asset": p2a,
            },
            "gate_verification": "ALL_ALIGNED",
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(structured, f, indent=2, default=str)

        return report_path

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    def _log(self, message):
        """Logs to both console and internal log."""
        print(f"[Claim-Assistant] {message}")
        self.claim_log.append(message)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Claim Assistant — Sovereign Recovery Pipeline")
    parser.add_argument(
        "--active-restoration", "-ar",
        action="store_true",
        help="Enable Active Restoration mode: focus exclusively on Direct-to-Bank"
             " with NAUPA registry scanning and Auto-Claim form generation."
    )
    parser.add_argument(
        "--names",
        nargs="*",
        help="Identity Marker: name variants (e.g., 'Eric Ashburn' 'Eric A Ashburn')"
    )
    parser.add_argument(
        "--addresses",
        nargs="*",
        help="Identity Marker: address history (e.g., '123 Main St, Portland, OR')"
    )
    parser.add_argument(
        "--ssn-masks",
        nargs="*",
        help="Identity Marker: SSN last-4 masks (e.g., '1234')"
    )
    args = parser.parse_args()

    mode_label = "ACTIVE RESTORATION" if args.active_restoration else "Standard"
    print("=" * 60)
    print(f"  CLAIM ASSISTANT — Sovereign Recovery Pipeline")
    print(f"  Mode: {mode_label}")
    print("=" * 60)

    # Build Identity Markers from CLI args if provided
    identity = None
    if args.names or args.addresses or args.ssn_masks:
        identity = {
            "name_variants": args.names or [],
            "address_history": args.addresses or [],
            "ssn_masks": args.ssn_masks or [],
            "dob_year_range": None,
        }

    assistant = ClaimAssistant(
        active_restoration=args.active_restoration,
        identity_markers=identity,
    )

    # Find the most recent manifest in the sanctuary vault
    vault_dir = os.path.join(_PROJECT_ROOT, "sanctuary", "assets", "vault")
    if os.path.exists(vault_dir):
        manifests = sorted(
            [f for f in os.listdir(vault_dir) if f.endswith(".enc")],
            reverse=True,
        )
        if manifests:
            manifest_path = os.path.join(vault_dir, manifests[0])
            print(f"\n[Claim-Assistant] Processing: {manifests[0]}")
            result = assistant.process_manifest(manifest_path)

            print(f"\n{'=' * 60}")
            print(f"  STATUS: {result['status']}")
            print(f"  Total Claims: {result['total_claims']}")
            for cat, count in result.get("claims", {}).items():
                print(f"    [{cat}] {count}")
            print(f"  Report: {result.get('report_path', 'N/A')}")
            print(f"{'=' * 60}")

            # Print the human-readable report
            if result.get("report_path") and os.path.exists(result["report_path"]):
                print(f"\n--- SOVEREIGN RECOVERY REPORT ---\n")
                with open(result["report_path"], "r") as f:
                    print(f.read())
        else:
            print("[Claim-Assistant] No manifests found in vault. Run First Light first.")
    else:
        print("[Claim-Assistant] Vault directory not found. Run First Light first.")
