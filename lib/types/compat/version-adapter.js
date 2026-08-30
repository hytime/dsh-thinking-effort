const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const verifiedProfiles = {
    '0.1.1-rc.2': 'legacy',
    '0.1.1-rc.7': 'legacy',
    '0.1.2-alpha.1': 'modern',
};
function parseVersion(value) {
    if (typeof value !== 'string')
        return undefined;
    return { value, valid: semverPattern.test(value) };
}
function profileForCapabilities(capabilities) {
    if (capabilities.settings === 'remote')
        return 'modern';
    if (capabilities.settings === 'legacy')
        return 'legacy';
    return 'unknown';
}
function invalidVersionDiagnostic(version, capabilities) {
    return {
        code: 'invalid-version',
        ...(version === undefined ? {} : { version }),
        actualCapabilities: capabilities,
        message: 'Runtime version metadata is not a valid semver value.',
    };
}
function mismatchDiagnostic(version, expectedProfile, capabilities) {
    return {
        code: 'version-capability-mismatch',
        version,
        expectedProfile,
        actualCapabilities: capabilities,
        message: `Version metadata expects ${expectedProfile}, but detected capabilities select ${profileForCapabilities(capabilities)}.`,
    };
}
export function resolveCompatibility(input) {
    const { capabilities } = input;
    const actualProfile = profileForCapabilities(capabilities);
    const parsed = parseVersion(input.version);
    const diagnostics = [];
    if (input.version === undefined) {
        return {
            profile: actualProfile,
            capabilities,
            diagnostics,
        };
    }
    if (parsed === undefined || !parsed.valid) {
        return {
            profile: 'unknown',
            ...(parsed === undefined ? {} : { version: parsed.value }),
            capabilities,
            diagnostics: [invalidVersionDiagnostic(parsed?.value, capabilities)],
        };
    }
    const expected = verifiedProfiles[parsed.value];
    if (expected === undefined) {
        return {
            profile: 'unknown',
            version: parsed.value,
            capabilities,
            diagnostics,
        };
    }
    if (expected !== actualProfile) {
        diagnostics.push(mismatchDiagnostic(parsed.value, expected, capabilities));
        return {
            profile: actualProfile,
            version: parsed.value,
            expected,
            capabilities,
            diagnostics,
        };
    }
    return {
        profile: expected,
        version: parsed.value,
        expected,
        capabilities,
        diagnostics,
    };
}
//# sourceMappingURL=version-adapter.js.map