// ============================================================
// /exports_pdf_sections.js  (3.77.0 — moved out of exports_pdf.js, code unchanged)
// PDF chart report: the sections exportToPDF() assembles: knowledge and
// skills, tools and trends, skills matrix, verification appendices,
// Task Analysis, clusters, learning outcomes, modules. Each receives
// the exportToPDF() locals it reads and returns the new yPos.
// ============================================================

import { appState } from './state.js';
import { getTaskCode } from './codes.js';
import { getTaskAnalysisExportData } from './task_analysis.js';
import { getTaskSelectionExportSummary, exportSelectionCell } from './task_selection.js';
import { moduleTitleWithLevel } from './modules.js';
import { drawTick } from './pdf_arabic.js';
import { getVerifiedChartData } from './verified_chart.js';
import { _t, _tf, _today } from './exports_pdf.js';

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfKnowledgeSkills({ behaviorsText, knowledgeText, margin, pageHeight, pageWidth, pdf, skillsText, yPos }) {
  if (knowledgeText || skillsText || behaviorsText) {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            pdf.setFontSize(14); // 14pt for main heading
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expGeneralKnowledgeSkills'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 8;
            
            // ── Three-column layout ────────────────────────────────
            // Each item is now WRAPPED to its own column width. The old
            // code drew every line at full length with no width limit,
            // so any item longer than a third of the page ran straight
            // across the neighbouring column — the overlap seen in the
            // exported chart. A gutter keeps adjacent columns from
            // touching even when both are full.
            const COL_GUTTER  = 6;                                   // mm between columns
            const thirdWidth  = (pageWidth - (margin * 2)) / 3;
            const colTextW    = thirdWidth - COL_GUTTER;
            const LINE_H_ITEM = 4.9;                                 // 12pt
            const bottomLimit = pageHeight - margin;

            const drawColumn = (text, headingId, colX) => {
                if (!text) return;
                let y = yPos;

                const headingEl = document.getElementById(headingId);
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(
                    pdf.splitTextToSize(headingEl ? headingEl.textContent : '', colTextW),
                    colX, y
                );
                y += 7;

                pdf.setFontSize(12);
                pdf.setFont(undefined, 'normal');

                text.split('\n').filter(line => line.trim()).forEach(item => {
                    const clean = item.trim().replace(/^[•\-*]\s*/, '');
                    const lines = pdf.splitTextToSize(clean, colTextW);
                    lines.forEach(line => {
                        if (y > bottomLimit) return;   // clip rather than spill off-page
                        pdf.text(line, colX, y);
                        y += LINE_H_ITEM;
                    });
                    y += 1;                            // small gap between items
                });
            };

            drawColumn(knowledgeText, 'knowledgeHeading', margin);
            drawColumn(skillsText,    'skillsHeading',    margin + thirdWidth);
            drawColumn(behaviorsText, 'behaviorsHeading', margin + (thirdWidth * 2));
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfToolsTrends({ margin, pageHeight, pageWidth, pdf, tools, trends, yPos }) {
  if (tools.length > 0 || trends.length > 0) {
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            // Same wrapping treatment as the Knowledge/Skills page —
            // tool and material names are often long enough to cross
            // into the neighbouring column when drawn unconstrained.
            const halfWidth   = (pageWidth - (margin * 2) - 5) / 2;
            const colTextW2   = halfWidth - 6;
            const LINE_H_ITEM2 = 4.9;
            const bottomLimit2 = pageHeight - margin;

            const drawList = (items, headingId, colX) => {
                if (!items.length) return;
                let y = yPos;

                const headingEl = document.getElementById(headingId);
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(
                    pdf.splitTextToSize(headingEl ? headingEl.textContent : '', colTextW2),
                    colX, y
                );
                y += 7;

                pdf.setFontSize(12);
                pdf.setFont(undefined, 'normal');
                items.forEach(item => {
                    const clean = item.trim().replace(/^[•\-*]\s*/, '');
                    pdf.splitTextToSize(clean, colTextW2).forEach(line => {
                        if (y > bottomLimit2) return;
                        pdf.text(line, colX, y);
                        y += LINE_H_ITEM2;
                    });
                    y += 1;
                });
            };

            drawList(tools,  'toolsHeading',  margin);
            drawList(trends, 'trendsHeading', margin + halfWidth + 5);
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfSkillsMatrix({ hasSkillsLevelData, margin, pageHeight, pageWidth, pdf, slCols, yPos }) {
  if (hasSkillsLevelData) {
            // Add new page for Skills Level Matrix
            pdf.addPage('a4', 'landscape');
            yPos = margin + 5;
            
            // Main heading
            pdf.setFontSize(14);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expEmployability'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;

            // Process each category
            appState.skillsLevelData.forEach(category => {
                // Skip empty categories
                if (category.category.trim() === '' && category.competencies.every(c => c.text.trim() === '')) {
                    return;
                }

                // Check if we need a new page
                if (yPos > pageHeight - 40) {
                    pdf.addPage('a4', 'landscape');
                    yPos = margin + 5;
                }

                // Category header
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.setFillColor(232, 232, 232);
                pdf.rect(margin, yPos - 4, pageWidth - (margin * 2), 6, 'F');
                pdf.text(category.category || _tf('expCategoryN', { n: category.id }), margin + 2, yPos);
                yPos += 8;

                // Column headers
                pdf.setFontSize(10);
                const colWidth = (pageWidth - (margin * 2)) / (slCols.length + 1);
                /* A name the user typed may be longer than its column: it is
                   cut to one line with "..." rather than running into the
                   next heading. Default names are drawn as they always were. */
                const _slHead = (col) => {
                    if (!col.custom && col.isDefault) return col.exportLabel;
                    const lines = pdf.splitTextToSize(col.exportLabel, colWidth - 4);
                    return lines.length > 1 ? String(lines[0]).replace(/\s+$/, '') + '...' : lines[0];
                };
                const _slHeaders = () => {
                    pdf.setFillColor(245, 245, 245);
                    pdf.rect(margin, yPos - 4, pageWidth - (margin * 2), 6, 'F');
                    pdf.text(_t('expCompetency'), margin + 2, yPos);
                    slCols.forEach((col, ci) => pdf.text(_slHead(col), margin + colWidth * (ci + 1) + 2, yPos));
                };
                _slHeaders();
                yPos += 8;

                // Competency rows
                pdf.setFont(undefined, 'normal');
                category.competencies
                    .filter(comp => comp.text.trim() !== '')
                    .forEach(competency => {
                        // Check if we need a new page
                        if (yPos > pageHeight - 20) {
                            pdf.addPage('a4', 'landscape');
                            yPos = margin + 5;
                            
                            // Repeat column headers on new page
                            pdf.setFontSize(10);
                            pdf.setFont(undefined, 'bold');
                            _slHeaders();
                            yPos += 8;
                            pdf.setFont(undefined, 'normal');
                        }

                        // Competency text
                        const competencyText = `${competency.id}. ${competency.text}`;
                        const textLines = pdf.splitTextToSize(competencyText, colWidth - 4);
                        const lineHeight = 5;
                        const cellHeight = Math.max(lineHeight * textLines.length, 6);

                        // Draw cell borders
                        for (let ci = 0; ci <= slCols.length; ci++) {
                            pdf.rect(margin + colWidth * ci, yPos - 4, colWidth, cellHeight);
                        }

                        // Competency text
                        textLines.forEach((line, idx) => {
                            pdf.text(line, margin + 2, yPos + (idx * lineHeight));
                        });

                        // Checkmarks (centered in cells)
                        const checkY = yPos + (cellHeight / 2) - 2;
                        // Drawn as strokes, not as the character U+2713:
                        // that glyph is in neither Helvetica nor Cairo, and
                        // jsPDF drops unmapped characters silently, so the
                        // matrix was printing blank cells in every language.
                        slCols.forEach((col, ci) => {
                            if ((competency.levels || {})[col.id]) {
                                drawTick(pdf, margin + colWidth * (ci + 1) + (colWidth / 2), checkY);
                            }
                        });

                        yPos += cellHeight + 2;
                    });

                yPos += 5; // Extra space after category
            });
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfVerificationAppendix({ margin, pageHeight, pageWidth, pdf, yPos }) {
  if (appState.tvExportMode === 'appendix' && appState.collectionMode === 'workshop') {
            // Check if we have valid results to include
            const validResults = Object.keys(appState.workshopResults).filter(key => 
                appState.workshopResults[key] && appState.workshopResults[key].valid
            );
            
            if (validResults.length > 0) {
                // Start new page for appendix
                pdf.addPage();
                yPos = margin + 10;
                
                // Appendix title
                pdf.setFontSize(16);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expTaskVerifAppendix'), pageWidth / 2, yPos, { align: 'center' });
                yPos += 12;
                
                // Methodology Summary
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expMethodologySummary'), margin, yPos);
                yPos += 8;
                
                pdf.setFontSize(11);
                pdf.setFont(undefined, 'normal');
                pdf.text(_tf('expCollectionMode', { v: _t(appState.collectionMode === 'workshop' ? 'modeWorkshop' : 'expIndividualSurvey') }), margin, yPos);
                yPos += 6;
                pdf.text(_tf('expParticipants', { v: appState.workshopParticipants }), margin, yPos);
                yPos += 6;
                pdf.text(_tf('expWorkflowMode', { v: _t(appState.workflowMode === 'standard' ? 'modeStandard' : 'modeExtended') }), margin, yPos);
                yPos += 6;
                pdf.text(_tf('expPriorityFormula', { v: _t(appState.priorityFormula === 'if' ? 'formulaIF' : 'formulaIFD') }), margin, yPos);
                yPos += 12;
                
                // Priority Rankings Table
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expPriorityRankings'), margin, yPos);
                yPos += 8;
                
                // Get sorted results
                const sortedResults = [];
                validResults.forEach(taskKey => {
                    const result = appState.workshopResults[taskKey];
                    
                    // Use stored duty and task titles (with backward compatibility)
                    let dutyText = result.dutyTitle;
                    let taskText = result.taskTitle;
                    
                    // Backward compatibility: if not stored, look up from DOM
                    if (!dutyText || !taskText) {
                        const taskParts = taskKey.split('_task_');
                        const dutyId = taskParts[0];
                        
                        if (!dutyText) {
                            const dutyInput = document.querySelector(`input[data-duty-id="${dutyId}"], textarea[data-duty-id="${dutyId}"]`);
                            dutyText = dutyInput ? dutyInput.value.trim() : 'Unassigned';
                        }
                        
                        if (!taskText) {
                            const taskInput = document.querySelector(`input[data-task-id="${taskKey}"], textarea[data-task-id="${taskKey}"]`);
                            taskText = taskInput ? taskInput.value.trim() : 'Unassigned';
                        }
                    }
                    
                    sortedResults.push({
                        key: taskKey,
                    
                        duty: dutyText,
                        task: taskText,
                        meanI: result.meanImportance,
                        meanF: result.meanFrequency,
                        meanD: result.meanDifficulty,
                        priority: result.priorityIndex
                    });
                });
                
                // Sort by priority descending
                sortedResults.sort((a, b) => b.priority - a.priority);
                
                // Table headers
                // 3.82.0: "Selected for training" column only when a task was left out;
                // the Task column gives it the room.
                const _tselCol = exportSelectionCell('') !== null;
                const colWidths = _tselCol ? [15, 50, 55, 25, 25, 25, 25, 25] : [15, 50, 75, 25, 25, 25, 25];
                const headers = [_t('expRank'), _t('expDutyLabel'), _t('expTaskLabel'),
                                 _t('expMeanI'), _t('expMeanF'), _t('expMeanD'), _t('expPriority')]
                                 .concat(_tselCol ? [_t('expTselCol')] : []);
                
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'bold');
                let xPos = margin;
                headers.forEach((header, i) => {
                    pdf.text(header, xPos, yPos);
                    xPos += colWidths[i];
                });
                yPos += 6;
                
                // Table rows
                pdf.setFont(undefined, 'normal');
                sortedResults.forEach((row, index) => {
                    if (yPos > pageHeight - 20) {
                        pdf.addPage();
                        yPos = margin + 10;
                    }
                    
                    xPos = margin;
                    pdf.text(`#${index + 1}`, xPos, yPos);
                    xPos += colWidths[0];
                    
                    // Truncate long text
                    const dutyTrunc = row.duty.length > 20 ? row.duty.substring(0, 17) + '...' : row.duty;
                    pdf.text(dutyTrunc, xPos, yPos);
                    xPos += colWidths[1];
                    
                    const _tMax = _tselCol ? 30 : 40;
                    
                    const taskTrunc = row.task.length > _tMax ? row.task.substring(0, _tMax - 3) + '...' : row.task;
                    pdf.text(taskTrunc, xPos, yPos);
                    xPos += colWidths[2];
                    
                    pdf.text(row.meanI !== null ? row.meanI.toFixed(2) : 'N/A', xPos, yPos);
                    xPos += colWidths[3];
                    pdf.text(row.meanF !== null ? row.meanF.toFixed(2) : 'N/A', xPos, yPos);
                    xPos += colWidths[4];
                    pdf.text(row.meanD !== null ? row.meanD.toFixed(2) : 'N/A', xPos, yPos);
                    xPos += colWidths[5];
                    pdf.text(row.priority !== null ? row.priority.toFixed(2) : 'N/A', xPos, yPos);
                    if (_tselCol) { xPos += colWidths[6]; pdf.text(exportSelectionCell(row.key), xPos, yPos); }
                    
                    yPos += 5;
                });
                
                yPos += 8;
                
                // Duty-Level Summary Section
                if (yPos > pageHeight - 30) {
                    pdf.addPage();
                    yPos = margin + 10;
                }
                
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expDutyLevelSummary'), margin, yPos);
                yPos += 5;
                
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'italic');
                pdf.text(_tf('expTrainingLoadMethod', { v: _t(appState.trainingLoadMethod === 'advanced' ? 'expAdvancedMethod' : 'expSimpleMethod') }), margin, yPos);
                yPos += 8;
                
                // Aggregate duty-level data
                const dutyMap = {};
                Object.keys(appState.workshopResults).forEach(taskKey => {
                    const result = appState.workshopResults[taskKey];
                    if (result && result.valid) {
                        let dutyId = result.dutyId || taskKey.split('_task_')[0];
                        let dutyTitle = result.dutyTitle;
                        
                        if (!dutyTitle) {
                            const dutyInput = document.querySelector(`input[data-duty-id="${dutyId}"], textarea[data-duty-id="${dutyId}"]`);
                            dutyTitle = dutyInput ? dutyInput.value.trim() : 'Unassigned';
                        }
                        
                        if (!dutyMap[dutyId]) {
                            dutyMap[dutyId] = {
                                dutyTitle: dutyTitle,
                                validTasks: 0,
                                prioritySum: 0,
                                difficultySum: 0,
                                tasks: []
                            };
                        }
                        
                        dutyMap[dutyId].validTasks++;
                        dutyMap[dutyId].prioritySum += result.priorityIndex;
                        dutyMap[dutyId].difficultySum += result.meanDifficulty;
                        dutyMap[dutyId].tasks.push({
                            priorityIndex: result.priorityIndex,
                            meanDifficulty: result.meanDifficulty
                        });
                    }
                });
                
                const dutyResults = [];
                Object.keys(dutyMap).forEach(dutyId => {
                    const duty = dutyMap[dutyId];
                    const avgPriority = duty.prioritySum / duty.validTasks;
                    
                    let trainingLoad = 0;
                    if (appState.trainingLoadMethod === 'advanced') {
                        trainingLoad = duty.tasks.reduce((sum, t) => sum + (t.priorityIndex * t.meanDifficulty), 0);
                    } else {
                        trainingLoad = avgPriority * duty.validTasks;
                    }
                    
                    dutyResults.push({
                        dutyTitle: duty.dutyTitle,
                        validTasks: duty.validTasks,
                        avgPriority: avgPriority,
                        trainingLoad: trainingLoad
                    });
                });
                
                dutyResults.sort((a, b) => b.avgPriority - a.avgPriority);
                
                // Duty table headers
                const dutyColWidths = [80, 30, 40, 45];
                const dutyHeaders = [_t('expDutyTitle'), _t('expTasks'),
                                     _t('expAvgPriority'), _t('expTrainingLoad')];
                
                pdf.setFontSize(9);
                pdf.setFont(undefined, 'bold');
                let dutyXPos = margin;
                dutyHeaders.forEach((header, i) => {
                    pdf.text(header, dutyXPos, yPos);
                    dutyXPos += dutyColWidths[i];
                });
                yPos += 6;
                
                // Duty table rows
                pdf.setFont(undefined, 'normal');
                dutyResults.forEach((duty) => {
                    if (yPos > pageHeight - 20) {
                        pdf.addPage();
                        yPos = margin + 10;
                    }
                    
                    dutyXPos = margin;
                    const dutyTitleTrunc = duty.dutyTitle.length > 35 ? duty.dutyTitle.substring(0, 32) + '...' : duty.dutyTitle;
                    pdf.text(dutyTitleTrunc, dutyXPos, yPos);
                    dutyXPos += dutyColWidths[0];
                    
                    pdf.text(duty.validTasks.toString(), dutyXPos, yPos);
                    dutyXPos += dutyColWidths[1];
                    
                    pdf.text(duty.avgPriority.toFixed(2), dutyXPos, yPos);
                    dutyXPos += dutyColWidths[2];
                    
                    pdf.text(duty.trainingLoad.toFixed(2), dutyXPos, yPos);
                    
                    yPos += 5;
                });
                
                yPos += 8;
                
                // Notes
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expNotes'), margin, yPos);
                yPos += 6;
                
                pdf.setFontSize(10);
                pdf.setFont(undefined, 'normal');
                const notes = [
                    'Weighted Mean = Σ(value × count) ÷ total responses',
                    'Priority Index calculated using selected formula',
                    'Higher priority values indicate greater training importance',
                    'Results based on DACUM methodology'
                ];
                notes.forEach(note => {
                    if (yPos > pageHeight - 15) {
                        pdf.addPage();
                        yPos = margin + 10;
                    }
                    pdf.text(`• ${note}`, margin, yPos);
                    yPos += 5;
                });
            }
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfVerifiedResults({ hasVerifiedResults, margin, pageHeight, pageWidth, pdf, yPos }) {
  if (appState.tvExportMode === 'appendix' && hasVerifiedResults) {
            // Start new page for verified results appendix
            pdf.addPage();
            yPos = margin + 10;
            
            // Appendix title
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expPostVoteResults'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 12;
            
            // Metadata
            pdf.setFontSize(11);
            pdf.setFont(undefined, 'normal');
            pdf.text(_tf('expOccupation', { v: appState.lwFinalizedData.occupation }), margin, yPos);
            yPos += 6;
            pdf.text(_tf('expJobTitle', { v: appState.lwFinalizedData.jobTitle }), margin, yPos);
            yPos += 6;
            pdf.text(_tf('expDate', { v: _today() }), margin, yPos);
            yPos += 6;
            const vFormula = appState.lwFinalizedData.appState.priorityFormula || 'if';
            const vFormulaText = _t(vFormula === 'ifd' ? 'formulaIFD' : 'formulaIF');
            pdf.text(`Priority Formula: ${vFormulaText}`, margin, yPos);
            yPos += 6;
            pdf.text(_tf('expTotalParticipants', { v: appState.lwAggregatedResults.totalVotes }), margin, yPos);
            yPos += 12;
            
            // Collect all verified tasks with metrics
            const verifiedTasks = [];
            Object.keys(appState.lwFinalizedData.duties).forEach(dutyId => {
                const duty = appState.lwFinalizedData.duties[dutyId];
                duty.tasks.forEach(task => {
                    if (task.priorityIndex !== undefined) {
                        verifiedTasks.push({
                            dutyTitle: duty.title,
                            taskText: task.text,
                            meanImportance: task.meanImportance,
                            meanFrequency: task.meanFrequency,
                            meanDifficulty: task.meanDifficulty,
                            priorityIndex: task.priorityIndex,
                            rank: task.rank,
                            key: task.id
                        });
                    }
                });
            });
            
            verifiedTasks.sort((a, b) => a.rank - b.rank);
            
            // Table header
            pdf.setFontSize(10);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expRank'),      margin,       yPos);
            pdf.text(_t('expDutyLabel'), margin + 15,  yPos);
            pdf.text(_t('expTaskLabel'), margin + 60,  yPos);
            pdf.text(_t('expInitialI'),  margin + 140, yPos);
            pdf.text(_t('expInitialF'),  margin + 150, yPos);
            pdf.text(_t('expInitialD'),  margin + 160, yPos);
            pdf.text(_t('expPI'),        margin + 170, yPos);
            const _tselCol = exportSelectionCell('') !== null;   // 3.82.0
            if (_tselCol) pdf.text(_t('expTselCol'), margin + 185, yPos);
            yPos += 5;
            pdf.line(margin, yPos, pageWidth - margin, yPos);
            yPos += 3;
            
            // Table rows
            pdf.setFont(undefined, 'normal');
            pdf.setFontSize(8);
            
            verifiedTasks.forEach(task => {
                // Check if need new page
                if (yPos + 8 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin;
                }
                
                pdf.text(String(task.rank), margin, yPos);
                const dutyLines = pdf.splitTextToSize(task.dutyTitle, 40);
                pdf.text(dutyLines[0] || '', margin + 15, yPos);
                const taskLines = pdf.splitTextToSize(task.taskText, 75);
                pdf.text(taskLines[0] || '', margin + 60, yPos);
                pdf.text(task.meanImportance.toFixed(2), margin + 140, yPos);
                pdf.text(task.meanFrequency.toFixed(2), margin + 150, yPos);
                pdf.text(task.meanDifficulty.toFixed(2), margin + 160, yPos);
                pdf.text(task.priorityIndex.toFixed(2), margin + 170, yPos);
                if (_tselCol) pdf.text(exportSelectionCell(task.key), margin + 185, yPos);
                yPos += 6;
            });
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfTaskAnalysis({ margin, pageHeight, pageWidth, pdf, yPos }) {
  {
            const taData = getTaskAnalysisExportData();
            const tsel   = getTaskSelectionExportSummary();
            if (taData.length > 0 || tsel) {
                pdf.addPage();
                yPos = margin + 5;

                pdf.setFontSize(16);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expTaskAnalysisAppendix'), pageWidth / 2, yPos, { align: 'center' });
                yPos += 12;

                const _ensureRoom = (need) => {
                    if (yPos + need > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                };

                // 3.81.0: tasks selected for training and analysis, and
                // the ones left out with their reasons.
                if (tsel) {
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_tf('expTselSummary', { n: tsel.selected, total: tsel.total }), margin, yPos);
                    yPos += 6;
                    pdf.setFontSize(10);
                    pdf.text(_t('expTselExcluded'), margin, yPos);
                    yPos += 5.5;
                    pdf.setFont(undefined, 'normal');
                    tsel.excluded.forEach(x => {
                        const lines = pdf.splitTextToSize(`${x.code} — ${x.text}${x.reason ? ' (' + x.reason + ')' : ''}`, pageWidth - 2 * margin - 10);
                        lines.forEach(line => { _ensureRoom(5); pdf.text(line, margin + 6, yPos); yPos += 5; });
                    });
                    yPos += 8;
                }

                const _hasMarker = (s) => /^(\d+[.\)]|[•\-\*○●])\s+/.test(s);

                // 3.46.0: a label starting with '=' is a user-added section title, used as typed.
                const _taLbl = (labelKey) => String(labelKey).charAt(0) === '=' ? String(labelKey).slice(1) : _t(labelKey);
                const _writeList = (labelKey, items) => {
                    if (!items || !items.length) return;
                    _ensureRoom(10);
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_taLbl(labelKey), margin + 4, yPos);
                    yPos += 5.5;
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    // Respect whatever the user already chose in the app
                    // (Number/Bullet buttons bake the marker into the text
                    // itself) — only auto-number lines that carry no marker
                    // of their own, so a bulleted list stays bulleted.
                    let autoNum = 0;
                    items.forEach((item) => {
                        const text = _hasMarker(item) ? item : `${++autoNum}. ${item}`;
                        const lines = pdf.splitTextToSize(text, pageWidth - 2 * margin - 10);
                        lines.forEach(line => {
                            _ensureRoom(5);
                            pdf.text(line, margin + 8, yPos);
                            yPos += 5;
                        });
                    });
                    yPos += 2;
                };

                const _writeText = (labelKey, value) => {
                    if (!value || !value.trim()) return;
                    _ensureRoom(10);
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_taLbl(labelKey), margin + 4, yPos);
                    yPos += 5.5;
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    const lines = pdf.splitTextToSize(value, pageWidth - 2 * margin - 10);
                    lines.forEach(line => {
                        _ensureRoom(5);
                        pdf.text(line, margin + 8, yPos);
                        yPos += 5;
                    });
                    yPos += 2;
                };

                taData.forEach((entry, idx) => {
                    _ensureRoom(18);
                    if (idx > 0) yPos += 4;

                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'bold');
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(`${_t('expDutyLabel')}: ${entry.dutyLetter} — ${entry.dutyTitle}`, margin, yPos);
                    pdf.setTextColor(0, 0, 0);
                    yPos += 6;

                    pdf.setFontSize(13);
                    pdf.setFont(undefined, 'bold');
                    const taskLines = pdf.splitTextToSize(`${entry.taskCode}. ${entry.taskText}`, pageWidth - 2 * margin);
                    taskLines.forEach(line => { _ensureRoom(7); pdf.text(line, margin, yPos); yPos += 7; });
                    yPos += 1;

                    const r = entry.record;
                    // 3.46.0: same order as the Task Analysis tab (by importance),
                    // then the sections the user added.
                    _writeList('taLblSteps',      r.performanceSteps);
                    _writeList('taLblKnowledge',  r.requiredKnowledge);
                    _writeList('taLblSkills',     r.requiredSkills);
                    _writeList('taLblCriteria',   r.performanceCriteria);
                    _writeText('taLblStandard',   r.performanceStandard);
                    _writeList('taLblTools',      r.toolsEquipmentMaterials);
                    _writeList('taLblSafety',     r.safetyOSH);
                    _writeList('taLblDecisions',  r.decisionsCriticalPoints);
                    _writeText('taLblConditions', r.conditionsWorkEnvironment);
                    _writeList('taLblErrors',     r.commonErrorsTroubleshooting);
                    (r.customSections || []).forEach(sec => _writeList('=' + sec.title, sec.items));

                    _ensureRoom(4);
                    pdf.setDrawColor(220, 220, 220);
                    pdf.line(margin, yPos, pageWidth - margin, yPos);
                    yPos += 4;
                });
            }
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfClusters({ margin, pageHeight, pageWidth, pdf, yPos }) {
  if (appState.clusteringData.clusters && appState.clusteringData.clusters.length > 0) {
            pdf.addPage();
            yPos = margin + 5;
            
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expClusters'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            appState.clusteringData.clusters.forEach((cluster, clusterIndex) => {
                const clusterNumber = clusterIndex + 1;
                
                // Check if need new page
                if (yPos + 20 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin + 5;
                }
                
                // Cluster header
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(_tf('expCompetencyN', { n: clusterNumber, name: cluster.name }), margin, yPos);
                yPos += 7;
                
                // Range section
                if (cluster.range && cluster.range.trim()) {
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t('expRangeLabel'), margin, yPos);
                    yPos += 5;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    const rangeLines = pdf.splitTextToSize(cluster.range, pageWidth - 2 * margin - 5);
                    rangeLines.forEach(line => {
                        if (yPos + 5 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        pdf.text(line, margin + 5, yPos);
                        yPos += 5;
                    });
                    yPos += 3;
                }
                
                // Related Tasks section
                if (cluster.tasks && cluster.tasks.length > 0) {
                    if (yPos + 10 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t('expRelatedTasks'), margin, yPos);
                    yPos += 5;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    
                    cluster.tasks.forEach(task => {
                        if (yPos + 6 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        
                        const taskCode = getTaskCode(task.id);
                        const taskText = `- ${taskCode}: ${task.text}`;
                        const lines = pdf.splitTextToSize(taskText, pageWidth - 2 * margin - 5);
                        
                        lines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 5, yPos);
                            yPos += 5;
                        });
                    });
                    yPos += 3;
                }
                
                // Performance Criteria section
                if (cluster.performanceCriteria && cluster.performanceCriteria.length > 0) {
                    if (yPos + 10 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(_t('expPCLabel'), margin, yPos);
                    yPos += 5;
                    
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'normal');
                    
                    cluster.performanceCriteria.forEach((criterion, idx) => {
                        if (yPos + 6 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        
                        const criterionText = `${clusterNumber}-${idx + 1} ${criterion}`;
                        const lines = pdf.splitTextToSize(criterionText, pageWidth - 2 * margin - 5);
                        
                        lines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 5, yPos);
                            yPos += 5;
                        });
                    });
                }
                
                yPos += 8;
            });
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfLearningOutcomes({ margin, pageHeight, pageWidth, pdf, yPos }) {
  if (appState.learningOutcomesData.outcomes && appState.learningOutcomesData.outcomes.length > 0) {
            pdf.addPage();
            yPos = margin + 5;
            
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expLearningOutcomes'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            // Group LOs by cluster
            const losByCluster = {};
            appState.learningOutcomesData.outcomes.forEach(lo => {
                lo.linkedCriteria.forEach(pc => {
                    if (!losByCluster[pc.clusterNumber]) {
                        losByCluster[pc.clusterNumber] = [];
                    }
                    if (!losByCluster[pc.clusterNumber].includes(lo)) {
                        losByCluster[pc.clusterNumber].push(lo);
                    }
                });
            });
            
            // Sort cluster numbers
            const clusterNumbers = Object.keys(losByCluster).sort((a, b) => parseInt(a) - parseInt(b));
            
            clusterNumbers.forEach(clusterNum => {
                const clusterIndex = parseInt(clusterNum) - 1;
                const cluster = appState.clusteringData.clusters[clusterIndex];
                const los = losByCluster[clusterNum];
                
                if (yPos + 20 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin + 5;
                }
                
                // Cluster header
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(`${cluster.name}`, margin, yPos);
                yPos += 7;
                
                // Learning Outcomes for this cluster
                los.forEach(lo => {
                    if (yPos + 15 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(12);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${lo.number}:`, margin + 5, yPos);
                    yPos += 5;
                    
                    if (lo.statement && lo.statement.trim()) {
                        pdf.setFontSize(10);
                        pdf.setFont(undefined, 'normal');
                        const statementLines = pdf.splitTextToSize(lo.statement, pageWidth - 2 * margin - 10);
                        statementLines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 10, yPos);
                            yPos += 5;
                        });
                    }
                    
                    yPos += 2;
                    
                    // Mapped Performance Criteria
                    pdf.setFontSize(10);
                    pdf.setFont(undefined, 'italic');
                    pdf.text(_t('expMappedPC'), margin + 10, yPos);
                    yPos += 5;
                    
                    pdf.setFont(undefined, 'normal');
                    pdf.setFontSize(9);
                    lo.linkedCriteria.forEach(pc => {
                        if (yPos + 5 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        const pcText = `- ${pc.id}: ${pc.text}`;
                        const pcLines = pdf.splitTextToSize(pcText, pageWidth - 2 * margin - 15);
                        pcLines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 15, yPos);
                            yPos += 5;
                        });
                    });
                    
                    yPos += 5;
                });
                
                yPos += 3;
            });
        }
  return yPos;
}

/* exportToPDF() section, moved out unchanged (3.78.0). Receives the
   exportToPDF() locals it reads; it returns the new yPos, which the caller stores. */
export function _pdfModules({ margin, pageHeight, pageWidth, pdf, yPos }) {
  if (appState.moduleMappingData.modules && appState.moduleMappingData.modules.length > 0) {
            pdf.addPage();
            yPos = margin + 5;
            
            pdf.setFontSize(16);
            pdf.setFont(undefined, 'bold');
            pdf.text(_t('expModuleMapping'), pageWidth / 2, yPos, { align: 'center' });
            yPos += 10;
            
            appState.moduleMappingData.modules.forEach(module => {
                if (yPos + 20 > pageHeight - margin) {
                    pdf.addPage();
                    yPos = margin + 5;
                }
                
                // Module title
                pdf.setFontSize(14);
                pdf.setFont(undefined, 'bold');
                pdf.text(moduleTitleWithLevel(module), margin, yPos);
                yPos += 7;
                
                // Learning Outcomes in this module
                pdf.setFontSize(12);
                pdf.setFont(undefined, 'bold');
                pdf.text(_t('expLOsLabel'), margin + 5, yPos);
                yPos += 5;
                
                module.learningOutcomes.forEach(lo => {
                    if (yPos + 15 > pageHeight - margin) {
                        pdf.addPage();
                        yPos = margin + 5;
                    }
                    
                    pdf.setFontSize(11);
                    pdf.setFont(undefined, 'bold');
                    pdf.text(`${lo.number}:`, margin + 10, yPos);
                    yPos += 5;
                    
                    if (lo.statement && lo.statement.trim()) {
                        pdf.setFontSize(10);
                        pdf.setFont(undefined, 'normal');
                        const statementLines = pdf.splitTextToSize(lo.statement, pageWidth - 2 * margin - 15);
                        statementLines.forEach(line => {
                            if (yPos + 5 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 15, yPos);
                            yPos += 5;
                        });
                    }
                    
                    yPos += 2;
                    
                    // Referenced Performance Criteria
                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'italic');
                    pdf.text(_t('expReferencedPC'), margin + 15, yPos);
                    yPos += 4;
                    
                    pdf.setFont(undefined, 'normal');
                    pdf.setFontSize(8);
                    lo.linkedCriteria.forEach(pc => {
                        if (yPos + 4 > pageHeight - margin) {
                            pdf.addPage();
                            yPos = margin + 5;
                        }
                        const pcText = `- ${pc.id}: ${pc.text}`;
                        const pcLines = pdf.splitTextToSize(pcText, pageWidth - 2 * margin - 20);
                        pcLines.forEach(line => {
                            if (yPos + 4 > pageHeight - margin) {
                                pdf.addPage();
                                yPos = margin + 5;
                            }
                            pdf.text(line, margin + 20, yPos);
                            yPos += 4;
                        });
                    });
                    
                    yPos += 3;
                });
                
                yPos += 5;
            });
        }
  return yPos;
}

/* Verified DACUM chart (3.86.0) — PDF twin of _docxVerifiedChart. */
export function _pdfVerifiedChart({ margin, pageHeight, pageWidth, pdf, yPos }) {
  const { duties, status } = getVerifiedChartData();
  if (!status.rated && !status.hasSelection) return yPos;
  const band = b => b === 'high' ? _t('vcHigh') : b === 'medium' ? _t('vcMedium') : b === 'low' ? _t('vcLow') : _t('vcUnrated');
  const ta = s => s === 'completed' ? _t('taStatusCompleted') : s === 'in-progress' ? _t('taStatusInProgress') : _t('taStatusNotStarted');
  const BAND_RGB = { high: [254, 215, 170], medium: [254, 243, 199], low: [226, 232, 240] };
  const W = pageWidth - 2 * margin;
  const cols = [0.44, 0.08, 0.13, 0.22, 0.13].map(f => f * W);
  const x0 = [margin]; cols.forEach((w, i) => x0.push(x0[i] + w));
  const newPage = () => { pdf.addPage('a4', 'landscape'); yPos = margin + 5; };
  const ensure = (h) => { if (yPos + h > pageHeight - margin) newPage(); };

  newPage();
  pdf.setFontSize(16); pdf.setFont(undefined, 'bold');
  pdf.text(_t('expVcTitle'), pageWidth / 2, yPos, { align: 'center' }); yPos += 7;
  pdf.setFontSize(9); pdf.setFont(undefined, 'normal');
  pdf.splitTextToSize(_t('expVcIntro'), W).forEach(l => { pdf.text(l, pageWidth / 2, yPos, { align: 'center' }); yPos += 4.2; });
  pdf.setFont(undefined, 'bold');
  pdf.text([_tf('vcStatusVer', { n: status.rated, total: status.total }), _tf('vcStatusTA', { n: status.analysed, total: status.selected }),
            _tf('vcStatusSel', { n: status.selected, total: status.total })].join('   ·   '), pageWidth / 2, yPos + 1, { align: 'center' });
  yPos += 8;

  const head = [_t('expTaskLabel'), _t('expVcColRank'), _t('expVcColPriority'), _t('expVcColSelected'), _t('expVcColTA')];
  const drawHead = () => {
    pdf.setFillColor(226, 232, 240); pdf.rect(margin, yPos, W, 6.5, 'F');
    pdf.setFontSize(8.5); pdf.setFont(undefined, 'bold'); pdf.setTextColor(30, 41, 59);
    head.forEach((h, i) => pdf.text(h, x0[i] + 2, yPos + 4.5));
    yPos += 6.5;
  };
  duties.forEach(d => {
    if (!d.tasks.length) return;
    ensure(20);
    pdf.setFontSize(11); pdf.setFont(undefined, 'bold'); pdf.setTextColor(3, 105, 161);
    pdf.text(`${_tf('lblDuty', { code: d.letter })}: ${d.title}`, margin, yPos + 4); yPos += 7;
    drawHead();
    d.tasks.forEach(r => {
      pdf.setFontSize(8.5); pdf.setFont(undefined, 'normal');
      const lines = pdf.splitTextToSize(`${r.code}  ${r.text}`, cols[0] - 4);
      const sel = r.selected ? _t('expTselYes') : _t('expTselNo') + (r.reason ? ' — ' + r.reason : '');
      const selLines = pdf.splitTextToSize(sel, cols[3] - 4);
      const h = Math.max(lines.length, selLines.length) * 4 + 2.5;
      if (yPos + h > pageHeight - margin) { newPage(); drawHead(); }
      if (r.band) { pdf.setFillColor(...BAND_RGB[r.band]); pdf.rect(x0[2], yPos, cols[2], h, 'F'); }
      if (r.selected) pdf.setTextColor(30, 41, 59); else pdf.setTextColor(107, 114, 128);
      lines.forEach((l, i) => pdf.text(l, x0[0] + 2, yPos + 4 + i * 4));
      pdf.text(r.rank ? `#${r.rank}` : '—', x0[1] + 2, yPos + 4);
      pdf.setTextColor(30, 41, 59);
      pdf.text(band(r.band), x0[2] + 2, yPos + 4);
      if (!r.selected) pdf.setTextColor(107, 114, 128);
      selLines.forEach((l, i) => pdf.text(l, x0[3] + 2, yPos + 4 + i * 4));
      pdf.text(r.selected ? ta(r.ta) : '—', x0[4] + 2, yPos + 4);
      pdf.setTextColor(0, 0, 0);
      pdf.setDrawColor(226, 232, 240); pdf.line(margin, yPos + h, margin + W, yPos + h);
      yPos += h;
    });
    yPos += 5;
  });
  return yPos;
}
