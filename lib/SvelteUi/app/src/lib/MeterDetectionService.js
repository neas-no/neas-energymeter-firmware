/**
 * Automatic Meter Detection Service
 * Analyzes meter ID and model data to suggest appropriate presets
 */

import { meterPresets } from './meterPresets.js';

// Known meter ID patterns for different manufacturers
const METER_ID_PATTERNS = {
    aidon: [
        /^7359\d+$/,        // Aidon 6xxx series
        /^6442\d+$/,        // Aidon 6442 series
        /^6490\d+$/,        // Aidon 6490 series
        /^6492\d+$/,        // Aidon 6492 series
    ],
    kaifa: [
        /^MA105\w*$/,       // Kaifa MA105
        /^MA304\w*$/,       // Kaifa MA304
        /^MA309\w*$/,       // Kaifa MA309
    ],
    kamstrup: [
        /^OMNIA\w*$/,       // Kamstrup OMNIA series
        /^6841\d+$/,        // Kamstrup 6841 series
        /^MULTICAL\w*$/,    // Kamstrup Multical series
    ]
};

// Communication patterns that indicate specific meter types
const COMMUNICATION_SIGNATURES = {
    'high_baud_inverted': {
        baud: 115200,
        parity: '8N1',
        invert: true,
        likelyPresets: ['aidon-rj12']
    },
    'standard_han_2400': {
        baud: 2400,
        parity: '8E1',
        invert: false,
        likelyPresets: ['aidon-rj45-han', 'kaifa-rj45']
    },
    'kamstrup_signature': {
        baud: 9600,
        parity: '8N2',
        invert: false,
        likelyPresets: ['kamstrup-han']
    }
};

/**
 * Analyzes live payload data to detect meter characteristics
 * @param {Object} payload - Live data payload from the meter
 * @returns {Object} Payload analysis results
 */
export function analyzeLivePayload(payload) {
    const analysis = {
        meterType: null,
        distributionSystem: null,
        hasL2: false,
        hasL3: false,
        confidence: 0,
        indicators: []
    };

    if (!payload || typeof payload !== 'object') {
        return analysis;
    }

    // 1. Check explicit meter type from payload
    if (typeof payload.mt === 'number' && payload.mt > 0) {
        analysis.meterType = payload.mt;
        analysis.confidence += 40;
        analysis.indicators.push(`Meter type explicitly set to ${payload.mt}`);
    }

    // 2. Check distribution system
    if (typeof payload.ds === 'number') {
        analysis.distributionSystem = payload.ds;
        analysis.confidence += 20;
        analysis.indicators.push(`Distribution system: ${payload.ds}`);
    }

    // 3. Analyze phase structure
    if (payload.l2 && typeof payload.l2 === 'object') {
        // Check if L2 has actual data or is just present
        if (payload.l2.u > 0 || payload.l2.i > 0 || payload.l2.p !== 0) {
            analysis.hasL2 = true;
            analysis.confidence += 15;
            analysis.indicators.push('L2 phase data detected');
        }
        
        // Check L2 presence indicator
        if (payload.l2.e !== undefined) {
            analysis.indicators.push(`L2 presence indicator: ${payload.l2.e}`);
        }
    }

    if (payload.l3 && typeof payload.l3 === 'object') {
        if (payload.l3.u > 0 || payload.l3.i > 0 || payload.l3.p !== 0) {
            analysis.hasL3 = true;
            analysis.confidence += 15;
            analysis.indicators.push('L3 phase data detected');
        }
    }

    // 4. Check HAN status
    if (typeof payload.hm === 'number') {
        if (payload.hm > 0) {
            analysis.confidence += 10;
            analysis.indicators.push(`HAN communication active (status: ${payload.hm})`);
        } else {
            analysis.indicators.push(`HAN communication issues (status: ${payload.hm})`);
        }
    }

    // 5. Check for encrypted data indicators
    if (payload.ic === 0 && payload.ec === 0 && payload.l1?.u === 0) {
        analysis.indicators.push('Possible encrypted or unconfigured meter');
    }

    return analysis;
}

/**
 * Maps meter type codes to manufacturer and model information
 * Based on common meter type codes used in Nordic countries
 * @param {number} meterType - Meter type code from payload
 * @returns {Object} Meter information
 */
export function getMeterInfoFromType(meterType) {
    const meterMap = {
        // Aidon meters
        1: { manufacturer: 'Aidon', model: '6442', presets: ['aidon-rj45-han'] },
        2: { manufacturer: 'Aidon', model: '6492', presets: ['aidon-rj45-han'] },
        7: { manufacturer: 'Aidon', model: '6490', presets: ['aidon-rj12'] },
        
        // Kaifa meters
        3: { manufacturer: 'Kaifa', model: 'MA105', presets: ['kaifa-rj45'] },
        4: { manufacturer: 'Kaifa', model: 'MA304', presets: ['kaifa-rj45'] },
        9: { manufacturer: 'Kaifa', model: 'MA309', presets: ['kaifa-rj45'] },
        
        // Kamstrup meters
        5: { manufacturer: 'Kamstrup', model: 'OMNIA', presets: ['kamstrup-han'] },
        8: { manufacturer: 'Kamstrup', model: 'Multical', presets: ['kamstrup-han'] },
        
        // Landis+Gyr meters
        6: { manufacturer: 'Landis+Gyr', model: 'E350', presets: ['lng-rj45'] },
        
        // Generic/fallback types
        10: { manufacturer: 'Generic', model: 'HAN-port', presets: ['aidon-rj45-han', 'kaifa-rj45'] },
        11: { manufacturer: 'Generic', model: 'M-Bus', presets: ['mbus-serial'] },
    };

    return meterMap[meterType] || { 
        manufacturer: 'Unknown', 
        model: `Type ${meterType}`, 
        presets: [] 
    };
}

/**
 * Enhanced meter detection using both static data and live payload
 * @param {Object} meterData - Static meter data (ID, model)
 * @param {Object} commConfig - Current communication configuration
 * @param {Object} payload - Live data payload from the meter
 * @returns {Object} Detection results with suggested presets
 */
export function detectMeterType(meterData, commConfig, payload = null) {
    const results = {
        confidence: 0,
        suggestedPresets: [],
        detectedManufacturer: null,
        detectedModel: null,
        reasoning: []
    };

    const meterId = meterData?.meterId || '';
    const meterModel = meterData?.meterModel || '';
    
    // 1. Analyze live payload if available (highest priority)
    if (payload) {
        const payloadAnalysis = analyzeLivePayload(payload);
        
        if (payloadAnalysis.meterType) {
            const meterInfo = getMeterInfoFromType(payloadAnalysis.meterType);
            results.detectedManufacturer = meterInfo.manufacturer;
            results.detectedModel = meterInfo.model;
            results.suggestedPresets.push(...meterInfo.presets);
            results.confidence += 50;
            results.reasoning.push(`Live data indicates ${meterInfo.manufacturer} ${meterInfo.model} (type ${payloadAnalysis.meterType})`);
        }

        // Add payload analysis indicators
        results.reasoning.push(...payloadAnalysis.indicators);
        results.confidence += Math.min(payloadAnalysis.confidence, 30);
    }
    
    // 2. Analyze Meter ID patterns (if no live data or as confirmation)
    for (const [manufacturer, patterns] of Object.entries(METER_ID_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(meterId)) {
                if (!results.detectedManufacturer) {
                    results.detectedManufacturer = manufacturer;
                    results.confidence += 30;
                } else if (results.detectedManufacturer.toLowerCase() === manufacturer) {
                    results.confidence += 15; // Confirmation bonus
                    results.reasoning.push(`Meter ID "${meterId}" confirms ${manufacturer} detection`);
                    continue;
                }
                
                results.reasoning.push(`Meter ID "${meterId}" matches ${manufacturer} pattern`);
                
                // Find presets for this manufacturer
                const manufacturerPresets = meterPresets.filter(preset => 
                    preset.manufacturer.toLowerCase().includes(manufacturer)
                );
                results.suggestedPresets.push(...manufacturerPresets.map(p => p.id));
                break;
            }
        }
    }

    // 3. Analyze communication signature
    if (commConfig) {
        for (const [sigName, sigData] of Object.entries(COMMUNICATION_SIGNATURES)) {
            if (commConfig.baud === sigData.baud && 
                commConfig.parity === sigData.parity && 
                commConfig.invert === sigData.invert) {
                
                results.confidence += 25;
                results.reasoning.push(`Communication pattern matches ${sigName}`);
                results.suggestedPresets.push(...sigData.likelyPresets);
                break;
            }
        }
    }

    // 4. Analyze meter model string
    if (meterModel) {
        if (!results.detectedModel) {
            results.detectedModel = meterModel;
        }
        results.confidence += 15;
        results.reasoning.push(`Detected meter model: ${meterModel}`);
        
        // Look for model-specific matches
        const modelLower = meterModel.toLowerCase();
        if (modelLower.includes('aidon')) {
            results.suggestedPresets.push('aidon-rj45-han');
        } else if (modelLower.includes('kaifa') || modelLower.includes('ma105') || modelLower.includes('ma304')) {
            results.suggestedPresets.push('kaifa-rj45');
        } else if (modelLower.includes('kamstrup') || modelLower.includes('omnia')) {
            results.suggestedPresets.push('kamstrup-han');
        }
    }

    // 5. Remove duplicates and rank by confidence
    results.suggestedPresets = [...new Set(results.suggestedPresets)];
    
    // 6. Add fallback suggestions if confidence is low
    if (results.confidence < 50 && commConfig) {
        if (commConfig.baud === 2400 && commConfig.parity === '8E1') {
            results.suggestedPresets.push('kaifa-rj45', 'aidon-rj45-han');
            results.reasoning.push('Added common HAN-port presets as fallback');
        }
    }

    return results;
}

/**
 * Monitors meter data and triggers detection when new data is available
 * @param {Function} callback - Called when detection results are available
 * @returns {Function} Stop monitoring function
 */
export function monitorMeterDetection(callback) {
    let lastMeterId = '';
    let detectionTimeout = null;

    const checkDetection = () => {
        // This would be called when new meter data arrives
        // Implementation depends on how meter data is received in the UI
        
        // For now, this is a placeholder - it would need to integrate
        // with the existing data flow (sysinfoStore, etc.)
    };

    return () => {
        if (detectionTimeout) {
            clearTimeout(detectionTimeout);
        }
    };
}

/**
 * Gets preset recommendation based on detection results
 * @param {Array} suggestedPresets - Array of preset IDs
 * @returns {Object|null} Most likely preset or null
 */
export function getBestPresetRecommendation(suggestedPresets) {
    if (!suggestedPresets.length) return null;
    
    // Return the first suggested preset (they're already ranked)
    const presetId = suggestedPresets[0];
    return meterPresets.find(preset => preset.id === presetId) || null;
}

/**
 * Provides detailed diagnostic information about the current meter state
 * @param {Object} payload - Live data payload from the meter
 * @param {Object} config - Current meter configuration
 * @returns {Object} Diagnostic information
 */
export function getDiagnosticInfo(payload, config) {
    const diagnostics = {
        connectionStatus: 'unknown',
        dataQuality: 'unknown',
        phaseConfiguration: 'single',
        communicationHealth: 'unknown',
        recommendations: []
    };

    if (!payload) {
        diagnostics.connectionStatus = 'no-data';
        diagnostics.recommendations.push('No meter data received - check HAN port connection');
        return diagnostics;
    }

    // Analyze connection status
    if (payload.hm > 0) {
        diagnostics.connectionStatus = 'connected';
    } else if (payload.hm === 0) {
        diagnostics.connectionStatus = 'disconnected';
        diagnostics.recommendations.push('HAN port connection appears inactive');
    }

    // Analyze data quality
    const hasValidVoltage = payload.l1?.u > 200 && payload.l1?.u < 260;
    const hasValidCurrent = payload.l1?.i >= 0;
    const hasValidPower = typeof payload.i === 'number';

    if (hasValidVoltage && hasValidCurrent && hasValidPower) {
        diagnostics.dataQuality = 'good';
    } else if (hasValidVoltage || hasValidCurrent || hasValidPower) {
        diagnostics.dataQuality = 'partial';
        diagnostics.recommendations.push('Some meter values appear invalid - check configuration');
    } else {
        diagnostics.dataQuality = 'poor';
        diagnostics.recommendations.push('No valid meter readings - verify meter type and settings');
    }

    // Determine phase configuration
    const hasL2Data = payload.l2?.u > 0 || payload.l2?.i > 0;
    const hasL3Data = payload.l3?.u > 0 || payload.l3?.i > 0;

    if (hasL2Data && hasL3Data) {
        diagnostics.phaseConfiguration = 'three-phase';
    } else if (hasL2Data) {
        diagnostics.phaseConfiguration = 'two-phase';
    }

    // Check communication health
    if (payload.r && payload.r > -70) {
        diagnostics.communicationHealth = 'excellent';
    } else if (payload.r && payload.r > -80) {
        diagnostics.communicationHealth = 'good';
    } else if (payload.r && payload.r > -90) {
        diagnostics.communicationHealth = 'fair';
        diagnostics.recommendations.push('WiFi signal is weak - consider moving closer to router');
    } else if (payload.r) {
        diagnostics.communicationHealth = 'poor';
        diagnostics.recommendations.push('WiFi signal is very weak - connection issues may occur');
    }

    return diagnostics;
}

/**
 * Validates if current meter configuration matches detected parameters
 * @param {Object} currentConfig - Current meter configuration
 * @param {Object} detectedParams - Auto-detected parameters
 * @returns {Object} Validation results
 */
export function validateMeterConfiguration(currentConfig, detectedParams) {
    const issues = [];
    const suggestions = [];

    if (detectedParams.baud && currentConfig.baud !== detectedParams.baud) {
        issues.push(`Baud rate mismatch: using ${currentConfig.baud}, detected ${detectedParams.baud}`);
        suggestions.push(`Change baud rate to ${detectedParams.baud}`);
    }

    if (detectedParams.parity && currentConfig.parity !== detectedParams.parity) {
        issues.push(`Parity mismatch: using ${currentConfig.parity}, detected ${detectedParams.parity}`);
        suggestions.push(`Change parity to ${detectedParams.parity}`);
    }

    if (detectedParams.invert !== undefined && currentConfig.invert !== detectedParams.invert) {
        issues.push(`Inversion mismatch: using ${currentConfig.invert}, detected ${detectedParams.invert}`);
        suggestions.push(`${detectedParams.invert ? 'Enable' : 'Disable'} signal inversion`);
    }

    return {
        isValid: issues.length === 0,
        issues,
        suggestions
    };
}