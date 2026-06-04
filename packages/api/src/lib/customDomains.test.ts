import { describe, it, expect } from "vitest";
import {
  normalizeHostname,
  isValidHostname,
  deriveDnsRecords,
  deriveStatus,
  collectVerificationErrors,
  customDomainsConfigured,
  type CfCustomHostname,
} from "./customDomains";

describe("normalizeHostname", () => {
  it("lowercases, trims, and strips a trailing dot", () => {
    expect(normalizeHostname("  Docs.Acme.COM. ")).toBe("docs.acme.com");
  });
});

describe("isValidHostname", () => {
  it("accepts ordinary subdomains and apexes", () => {
    expect(isValidHostname("docs.acme.com")).toBe(true);
    expect(isValidHostname("acme.com")).toBe(true);
    expect(isValidHostname("a.b.c.example.io")).toBe(true);
  });

  it("rejects single-label, wildcard, scheme, path, and empty inputs", () => {
    expect(isValidHostname("localhost")).toBe(false);
    expect(isValidHostname("*.acme.com")).toBe(false);
    expect(isValidHostname("https://docs.acme.com")).toBe(false);
    expect(isValidHostname("docs.acme.com/path")).toBe(false);
    expect(isValidHostname("")).toBe(false);
    expect(isValidHostname("  ")).toBe(false);
  });

  it("rejects labels with bad hyphen placement and all-numeric TLDs (IPs)", () => {
    expect(isValidHostname("-bad.acme.com")).toBe(false);
    expect(isValidHostname("bad-.acme.com")).toBe(false);
    expect(isValidHostname("192.168.0.1")).toBe(false);
  });

  it("rejects an over-long hostname", () => {
    const long = `${"a".repeat(64)}.acme.com`;
    expect(isValidHostname(long)).toBe(false);
  });
});

describe("deriveDnsRecords", () => {
  const target = "docs.cubityfir.st";

  it("always emits the traffic CNAME first", () => {
    const recs = deriveDnsRecords({ id: "x", hostname: "docs.acme.com" }, target);
    expect(recs[0]).toMatchObject({ type: "CNAME", name: "docs.acme.com", value: target });
  });

  it("adds ownership + SSL DCV TXT records when Cloudflare supplies them", () => {
    const cf: CfCustomHostname = {
      id: "x",
      hostname: "docs.acme.com",
      ownership_verification: { type: "txt", name: "_cf-custom-hostname.docs.acme.com", value: "abc123" },
      ssl: {
        status: "pending_validation",
        validation_records: [{ txt_name: "_acme-challenge.docs.acme.com", txt_value: "deadbeef" }],
      },
    };
    const recs = deriveDnsRecords(cf, target);
    expect(recs).toHaveLength(3);
    expect(recs.filter(r => r.type === "TXT").map(r => r.name)).toEqual([
      "_cf-custom-hostname.docs.acme.com",
      "_acme-challenge.docs.acme.com",
    ]);
  });

  it("omits TXT records once the hostname is fully active", () => {
    const cf: CfCustomHostname = { id: "x", hostname: "docs.acme.com", status: "active", ssl: { status: "active" } };
    const recs = deriveDnsRecords(cf, target);
    expect(recs).toHaveLength(1);
    expect(recs[0].type).toBe("CNAME");
  });
});

describe("deriveStatus", () => {
  it("is active only when both hostname and ssl are active", () => {
    expect(deriveStatus({ id: "x", hostname: "h", status: "active", ssl: { status: "active" } })).toBe("active");
    expect(deriveStatus({ id: "x", hostname: "h", status: "active", ssl: { status: "pending_validation" } })).toBe("pending");
    expect(deriveStatus({ id: "x", hostname: "h", status: "pending" })).toBe("pending");
  });

  it("is error when verification errors are present", () => {
    expect(deriveStatus({ id: "x", hostname: "h", verification_errors: ["nope"] })).toBe("error");
    expect(
      deriveStatus({ id: "x", hostname: "h", ssl: { validation_errors: [{ message: "dcv failed" }] } }),
    ).toBe("error");
  });
});

describe("collectVerificationErrors", () => {
  it("merges hostname and ssl validation errors", () => {
    const cf: CfCustomHostname = {
      id: "x",
      hostname: "h",
      verification_errors: ["host err"],
      ssl: { validation_errors: [{ message: "ssl err" }, { message: undefined }] },
    };
    expect(collectVerificationErrors(cf)).toEqual(["host err", "ssl err"]);
  });
});

describe("customDomainsConfigured", () => {
  it("requires token, zone, and CNAME target", () => {
    expect(customDomainsConfigured({})).toBe(false);
    expect(customDomainsConfigured({ CF_API_TOKEN: "t", CF_ZONE_ID: "z" })).toBe(false);
    expect(
      customDomainsConfigured({ CF_API_TOKEN: "t", CF_ZONE_ID: "z", CUSTOM_DOMAIN_CNAME_TARGET: "docs.cubityfir.st" }),
    ).toBe(true);
  });
});
