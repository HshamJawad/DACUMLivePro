// ============================================================
// /exports_docx_sections.js  (3.77.0 — moved out of exports_docx.js, code unchanged)
// Word chart report: the sections exportToWord() assembles: duties,
// additional info, custom sections, skills matrix, verification
// appendices, Task Analysis, clusters, learning outcomes, modules.
// They receive the exportToWord() locals they read and write none.
// ============================================================

import { appState } from './state.js';
import { getTaskCode, getDutyLetter } from './codes.js';
import { getTaskAnalysisExportData } from './task_analysis.js';
import { getTaskSelectionExportSummary } from './task_selection.js';
import { moduleTitleWithLevel } from './modules.js';
import { _rtl, _start, _t, _tblFill, _tf, _today } from './exports_docx.js';

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxDuties({ Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, children, duties }) {
  duties.forEach((dutyData, dutyIndex) => {
                    const dutyLetter = getDutyLetter(dutyIndex);
                    const dutyLabel = `${_tf('lblDuty', { code: dutyLetter })}: ${dutyData.duty}`;
                    
                    // Calculate number of rows needed (header + task rows)
                    const tasksPerRow = 4;
                    const numTaskRows = Math.ceil(dutyData.tasks.length / tasksPerRow);
                    const tableRows = [];
                    
                    // Header row (duty description spans all 4 columns)
                    tableRows.push(
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ __shaded: true,
                                                    text: dutyLabel,
                                                    bold: true,
                                                    size: 24, // 12pt
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                    ],
                                    columnSpan: 4,
                                    shading: {
                                        // DCDCDC = RGB(220,220,220) — the exact grey the
                                        // PDF exporter fills duty bars with, so the Word
                                        // and PDF versions of the same chart match.
                                        fill: _tblFill(),
                                        type: ShadingType.CLEAR,
                                        color: "auto",
                                    },
                                    width: {
                                        size: 100,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                            ],
                        })
                    );
                    
                    // Task rows (4 tasks per row)
                    for (let row = 0; row < numTaskRows; row++) {
                        const rowCells = [];
                        
                        for (let col = 0; col < tasksPerRow; col++) {
                            const taskIndex = row * tasksPerRow + col;
                            
                            if (taskIndex < dutyData.tasks.length) {
                                const taskLabel = _tf('lblTask', { code: `${dutyLetter}${taskIndex + 1}` });
                                
                                rowCells.push(
                                    new TableCell({
                                        children: [
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: `${taskLabel}: `,
                                                        bold: true,
                                                        size: 24, // 12pt
                                                    }),
                                                    new TextRun({
                                                        text: dutyData.tasks[taskIndex],
                                                        size: 24, // 12pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            }),
                                        ],
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                    })
                                );
                            } else {
                                // Empty cell
                                rowCells.push(
                                    new TableCell({
                                        children: [new Paragraph('')],
                                        width: {
                                            size: 25,
                                            type: WidthType.PERCENTAGE,
                                        },
                                    })
                                );
                            }
                        }
                        
                        tableRows.push(new TableRow({ children: rowCells }));
                    }
                    
                    // Create the table with 16cm width
                    children.push(
                        new Table({
                            visuallyRightToLeft: _rtl(),
                            width: {
                                size: 9071, // 16cm in twips (16 * 567.05 ≈ 9071)
                                type: WidthType.DXA,
                            },
                            /* columnWidths is what docx@7.8.2 builds
                               <w:tblGrid> from — and the ONLY thing. Omit it
                               and the grid is written as 100 twips per
                               column; under <w:tblLayout w:type="fixed"/>
                               that grid outranks every tcW and the table
                               collapses. It survived here only because the
                               cells are sized in PERCENTAGE, which Word
                               happens to honour anyway; the moment a cell
                               moves to DXA the table breaks. Values below
                               are the same proportions the cells declare,
                               resolved against the 9071-twip (16 cm) width.
                               Four task columns at 25% each; the last absorbs the rounding remainder. */
                            columnWidths: [2268, 2268, 2268, 2267],
                            layout: "fixed", // Fixed table layout for consistent width
                            rows: tableRows,
                        })
                    );
                    
                    // Add spacing after table
                    children.push(new Paragraph({ spacing: { after: 200 } }));
                });
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxAdditionalInfo({ Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, _labelledTable, additionalInfoSections, children }) {
  additionalInfoSections.forEach((section, index) => {
                    // Special handling for Acronyms (index 3, content1) - separate table with heading in first cell
                    if (index === 3 && section.content1) {
                        const row = new TableRow({
                            children: [
                                // First cell: Heading only with gray background
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ __shaded: true,
                                                    text: section.heading1,
                                                    bold: true,
                                                    size: 24, // 12pt
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                    ],
                                    shading: {
                                        fill: _tblFill(), // RGB(220,220,220) — matches the duty bar
                                        type: ShadingType.CLEAR,
                                        color: "auto",
                                    },
                                    width: {
                                        size: 30,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                                // Second cell: Content only
                                new TableCell({
                                    children: section.content1.split('\n').filter(line => line.trim()).map(line => 
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: line.trim().replace(/^[•\-*]\s*/, '• '),
                                                    size: 24, // 12pt
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        })
                                    ),
                                    width: {
                                        size: 70,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                            ],
                        });
                        
                        children.push(
                            new Table({
                                visuallyRightToLeft: _rtl(),
                                width: {
                                    size: 9071, // 16cm in twips
                                    type: WidthType.DXA,
                                },
                                /* columnWidths is what docx@7.8.2 builds <w:tblGrid> from —
                                   and the ONLY thing. Omit it and the grid is written as 100
                                   twips per column, which under <w:tblLayout w:type="fixed"/>
                                   outranks every tcW and collapses the table. This one
                                   survived only because its cells are sized in PERCENTAGE,
                                   which Word honours anyway; the moment one moves to DXA the
                                   table breaks. Widths below are the same proportions the
                                   cells declare, resolved against 9071 twips (16 cm).
                                   Two columns at 30% / 70%. */
                                columnWidths: [2721, 6350],
                                layout: "fixed",
                                rows: [row],
                            })
                        );
                        
                        children.push(new Paragraph({ spacing: { after: 200 } }));

                        /* Career Path is content2 of this same pair. The
                           branch above renders content1 only, so whenever
                           Acronyms had text the Career Path the facilitator
                           typed was read from the field and then silently
                           discarded — it never reached the document. It is
                           rendered here in the same labelled-table form.
                           (When Acronyms is empty this branch is skipped and
                           the regular two-column format below already carried
                           Career Path, which is why the loss only showed up
                           on charts that filled in both.) */
                        if (section.content2 && section.content2.trim()) {
                            _labelledTable(section.heading2, section.content2);
                        }
                    }
                    // Regular format for all other sections (heading + content together)
                    else if (section.content1 || section.content2) {
                        const row = new TableRow({
                            children: [
                                // Left column
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: section.heading1,
                                                    bold: true,
                                                    size: 24, // 12pt
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                        ...section.content1.split('\n').filter(line => line.trim()).map(line => 
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: line.trim().replace(/^[•\-*]\s*/, '• '),
                                                        size: 24, // 12pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            })
                                        ),
                                    ],
                                    width: {
                                        size: 50,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                                // Right column
                                new TableCell({
                                    children: section.content2 ? [
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: section.heading2,
                                                    bold: true,
                                                    size: 24, // 12pt
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                        ...section.content2.split('\n').filter(line => line.trim()).map(line => 
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: line.trim().replace(/^[•\-*]\s*/, '• '),
                                                        size: 24, // 12pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            })
                                        ),
                                    ] : [new Paragraph('')],
                                    width: {
                                        size: 50,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                            ],
                        });
                        
                        children.push(
                            new Table({
                                visuallyRightToLeft: _rtl(),
                                width: {
                                    size: 9071, // 16cm in twips
                                    type: WidthType.DXA,
                                },
                                /* columnWidths is what docx@7.8.2 builds <w:tblGrid> from —
                                   and the ONLY thing. Omit it and the grid is written as 100
                                   twips per column, which under <w:tblLayout w:type="fixed"/>
                                   outranks every tcW and collapses the table. This one
                                   survived only because its cells are sized in PERCENTAGE,
                                   which Word honours anyway; the moment one moves to DXA the
                                   table breaks. Widths below are the same proportions the
                                   cells declare, resolved against 9071 twips (16 cm).
                                   Two equal columns at 50% each. */
                                columnWidths: [4536, 4535],
                                layout: "fixed",
                                rows: [row],
                            })
                        );
                        
                        children.push(new Paragraph({ spacing: { after: 200 } }));
                    }
                });
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxCustomSections({ Paragraph, Table, TableCell, TableRow, TextRun, WidthType, children, customSectionDivs }) {
  customSectionDivs.forEach(sectionDiv => {
                    const headingElement = sectionDiv.querySelector('h3');
                    const textareaElement = sectionDiv.querySelector('textarea');
                    
                    if (headingElement && textareaElement && textareaElement.value.trim()) {
                        const row = new TableRow({
                            children: [
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({
                                                    text: headingElement.textContent,
                                                    bold: true,
                                                    size: 24, // 12pt
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                        ...textareaElement.value.split('\n').filter(line => line.trim()).map(line => 
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: line.trim().replace(/^[•\-*]\s*/, '• '),
                                                        size: 24, // 12pt
                                                    }),
                                                ],
                                                bidirectional: _rtl(),
                                            })
                                        ),
                                    ],
                                    columnSpan: 2,
                                    width: {
                                        size: 100,
                                        type: WidthType.PERCENTAGE,
                                    },
                                }),
                            ],
                        });
                        
                        children.push(
                            new Table({
                                visuallyRightToLeft: _rtl(),
                                width: {
                                    size: 9071, // 16cm in twips
                                    type: WidthType.DXA,
                                },
                                /* columnWidths is what docx@7.8.2 builds <w:tblGrid> from —
                                   and the ONLY thing. Omit it and the grid is written as 100
                                   twips per column, which under <w:tblLayout w:type="fixed"/>
                                   outranks every tcW and collapses the table. This one
                                   survived only because its cells are sized in PERCENTAGE,
                                   which Word honours anyway; the moment one moves to DXA the
                                   table breaks. Widths below are the same proportions the
                                   cells declare, resolved against 9071 twips (16 cm).
                                   One cell spans both columns, so the grid still declares two. */
                                columnWidths: [4536, 4535],
                                layout: "fixed", // Fixed table layout for consistent width
                                rows: [row],
                            })
                        );
                        
                        children.push(new Paragraph({ spacing: { after: 200 } }));
                    }
                });
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxSkillsMatrix({ AlignmentType, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, children, hasSkillsLevelData, slCols, slCompW, slLevelW, slN, slPct }) {
  if (hasSkillsLevelData) {
                    // The matrix starts on its own page (3.41.1) — it was
                    // running on straight after the previous section.
                    children.push(new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() }));
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _t('expEmployability'),
                                bold: true,
                                size: 24, // 12pt
                            }),
                        ],
                        spacing: { after: 200 },
                        bidirectional: _rtl(),
                    }));

                    // Create Skills Level Matrix table
                    appState.skillsLevelData.forEach(category => {
                        // Skip empty categories
                        if (category.category.trim() === '' && category.competencies.every(c => c.text.trim() === '')) {
                            return;
                        }

                        // Category header row
                        const headerRow = new TableRow({
                            children: [
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ __shaded: true,
                                                    text: category.category || _tf('expCategoryN', { n: category.id }),
                                                    bold: true,
                                                    size: 24,
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                    ],
                                    columnSpan: slN + 1,
                                    shading: {
                                        fill: _tblFill(),
                                        type: ShadingType.CLEAR,
                                        color: "auto",
                                    },
                                }),
                            ],
                        });

                        // Column headers row
                        const columnHeaderRow = new TableRow({
                            children: [
                                new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ __shaded: true,
                                                    text: _t('expCompetency'),
                                                    bold: true,
                                                    size: 22,
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                    ],
                                    width: { size: 40, type: WidthType.PERCENTAGE },
                                    shading: {
                                        fill: _tblFill(),
                                        type: ShadingType.CLEAR,
                                        color: "auto",
                                    },
                                }),
                                ...slCols.map(col => new TableCell({
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ __shaded: true,
                                                    text: col.exportLabel,
                                                    bold: true,
                                                    size: 20,
                                                }),
                                            ],
                                            bidirectional: _rtl(),
                                        }),
                                    ],
                                    width: { size: slPct, type: WidthType.PERCENTAGE },
                                    shading: {
                                        fill: _tblFill(),
                                        type: ShadingType.CLEAR,
                                        color: "auto",
                                    },
                                })),
                            ],
                        });

                        // Competency rows
                        const competencyRows = category.competencies
                            .filter(comp => comp.text.trim() !== '')
                            .map(competency => {
                                return new TableRow({
                                    children: [
                                        new TableCell({
                                            children: [
                                                new Paragraph({
                                                    children: [
                                                        new TextRun({
                                                            text: `${competency.id}. ${competency.text}`,
                                                            size: 22,
                                                        }),
                                                    ],
                                                    bidirectional: _rtl(),
                                                }),
                                            ],
                                            width: { size: 40, type: WidthType.PERCENTAGE },
                                        }),
                                        ...slCols.map(col => new TableCell({
                                            children: [
                                                new Paragraph({
                                                    children: [
                                                        new TextRun({
                                                            text: (competency.levels || {})[col.id] ? '✓' : '',
                                                            size: 22,
                                                        }),
                                                    ],
                                                    alignment: AlignmentType.CENTER,
                                                    bidirectional: _rtl(),
                                                }),
                                            ],
                                            width: { size: slPct, type: WidthType.PERCENTAGE },
                                        })),
                                    ],
                                });
                            });

                        // Add table for this category
                        children.push(
                            new Table({
                                visuallyRightToLeft: _rtl(),
                                width: {
                                    size: 9071, // 16cm in twips
                                    type: WidthType.DXA,
                                },
                                /* columnWidths is what docx@7.8.2 builds <w:tblGrid> from —
                                   and the ONLY thing. Omit it and the grid is written as 100
                                   twips per column, which under <w:tblLayout w:type="fixed"/>
                                   outranks every tcW and collapses the table. This one
                                   survived only because its cells are sized in PERCENTAGE,
                                   which Word honours anyway; the moment one moves to DXA the
                                   table breaks. Widths below are the same proportions the
                                   cells declare, resolved against 9071 twips (16 cm).
                                   40% competency, then the rest shared by the levels
                                   (four defaults: 15% each → 1361, 1361, 1360, 1360). */
                                columnWidths: [slCompW, ...slLevelW],
                                layout: "fixed",
                                rows: [headerRow, columnHeaderRow, ...competencyRows],
                            })
                        );
                        
                        children.push(new Paragraph({ spacing: { after: 200 } }));
                    });
                }
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxVerificationAppendix({ AlignmentType, PageBreak, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, children }) {
  if (appState.tvExportMode === 'appendix' && appState.collectionMode === 'workshop') {
                    const validResults = Object.keys(appState.workshopResults).filter(key => 
                        appState.workshopResults[key] && appState.workshopResults[key].valid
                    );
                    
                    if (validResults.length > 0) {
                        // Page break before appendix
                        children.push(new Paragraph({
                            children: [new PageBreak()],
                        }));
                        
                        // Appendix title
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expTaskVerifAppendix'),
                                    bold: true,
                                    size: 32, // 16pt
                                }),
                            ],
                            spacing: { after: 300 },
                            bidirectional: _rtl(), // direction of the Task Verification section
                        }));
                        
                        // Methodology Summary heading
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expMethodologySummary'),
                                    bold: true,
                                    size: 28, // 14pt
                                }),
                            ],
                            spacing: { after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Methodology details
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _tf('expCollectionMode', { v: _t(appState.collectionMode === 'workshop' ? 'modeWorkshop' : 'expIndividualSurvey') }),
                                    size: 22,
                                }),
                            ],
                            spacing: { after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _tf('expParticipants', { v: appState.workshopParticipants }),
                                    size: 22,
                                }),
                            ],
                            spacing: { after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _tf('expWorkflowMode', { v: _t(appState.workflowMode === 'standard' ? 'modeStandard' : 'modeExtended') }),
                                    size: 22,
                                }),
                            ],
                            spacing: { after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _tf('expPriorityFormula', { v: _t(appState.priorityFormula === 'if' ? 'formulaIF' : 'formulaIFD') }),
                                    size: 22,
                                }),
                            ],
                            spacing: { after: 300 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Priority Rankings heading
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expPriorityRankings'),
                                    bold: true,
                                    size: 28,
                                }),
                            ],
                            spacing: { after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Get and sort results
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
                                duty: dutyText,
                                task: taskText,
                                meanI: result.meanImportance,
                                meanF: result.meanFrequency,
                                meanD: result.meanDifficulty,
                                priority: result.priorityIndex
                            });
                        });
                        
                        sortedResults.sort((a, b) => b.priority - a.priority);
                        
                        // Create table
                        const tableRows = [];
                        
                        // Header row
                        tableRows.push(new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expRank'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expDutyLabel'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expTaskLabel'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expMeanI'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expMeanF'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expMeanD'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expPriority'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })],
                                    shading: { fill: _tblFill(), type: ShadingType.CLEAR, color: 'auto' },
                                }),
                            ],
                        }));
                        
                        // Data rows
                        sortedResults.forEach((row, index) => {
                            tableRows.push(new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `#${index + 1}` })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: row.duty, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: row.task, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.meanI !== null ? row.meanI.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.meanF !== null ? row.meanF.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.meanD !== null ? row.meanD.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.priority !== null ? row.priority.toFixed(2) : 'N/A' })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                ],
                            }));
                        });
                        
                        children.push(new Table({
                            visuallyRightToLeft: _rtl(),
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: tableRows,
                        }));
                        
                        // Duty-Level Summary section
                        children.push(new Paragraph({ spacing: { after: 400 } }));
                        
                        children.push(new Paragraph({
                            children: [new TextRun({ text: _t('expDutyLevelSummary'), bold: true, size: 28 })],
                            spacing: { after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        children.push(new Paragraph({
                            children: [new TextRun({ text: _tf('expTrainingLoadMethod', { v: _t(appState.trainingLoadMethod === 'advanced' ? 'expAdvancedMethod' : 'expSimpleMethod') }), size: 20, italics: true })],
                            spacing: { after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Aggregate duty-level data
                        const appendixDutyMap = {};
                        Object.keys(appState.workshopResults).forEach(taskKey => {
                            const result = appState.workshopResults[taskKey];
                            if (result && result.valid) {
                                let dutyId = result.dutyId || taskKey.split('_task_')[0];
                                let dutyTitle = result.dutyTitle;
                                
                                if (!dutyTitle) {
                                    const dutyInput = document.querySelector(`input[data-duty-id="${dutyId}"], textarea[data-duty-id="${dutyId}"]`);
                                    dutyTitle = dutyInput ? dutyInput.value.trim() : 'Unassigned';
                                }
                                
                                if (!appendixDutyMap[dutyId]) {
                                    appendixDutyMap[dutyId] = { dutyTitle: dutyTitle, validTasks: 0, prioritySum: 0, tasks: [] };
                                }
                                
                                appendixDutyMap[dutyId].validTasks++;
                                appendixDutyMap[dutyId].prioritySum += result.priorityIndex;
                                appendixDutyMap[dutyId].tasks.push({ priorityIndex: result.priorityIndex, meanDifficulty: result.meanDifficulty });
                            }
                        });
                        
                        const appendixDutyResults = [];
                        Object.keys(appendixDutyMap).forEach(dutyId => {
                            const duty = appendixDutyMap[dutyId];
                            const avgPriority = duty.prioritySum / duty.validTasks;
                            let trainingLoad = 0;
                            if (appState.trainingLoadMethod === 'advanced') {
                                trainingLoad = duty.tasks.reduce((sum, t) => sum + (t.priorityIndex * t.meanDifficulty), 0);
                            } else {
                                trainingLoad = avgPriority * duty.validTasks;
                            }
                            appendixDutyResults.push({ dutyTitle: duty.dutyTitle, validTasks: duty.validTasks, avgPriority: avgPriority, trainingLoad: trainingLoad });
                        });
                        
                        appendixDutyResults.sort((a, b) => b.avgPriority - a.avgPriority);
                        
                        // Duty table
                        const dutyTableRows = [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expDutyTitle'), bold: true })], alignment: _start(AlignmentType), bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expTasks'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expAvgPriority'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ __shaded: true, text: _t('expTrainingLoad'), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })], shading: { fill: _tblFill() } }),
                                ],
                            })
                        ];
                        
                        appendixDutyResults.forEach(duty => {
                            dutyTableRows.push(new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ text: duty.dutyTitle, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: duty.validTasks.toString() })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: duty.avgPriority.toFixed(2) })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: duty.trainingLoad.toFixed(2), bold: true })], alignment: AlignmentType.CENTER, bidirectional: _rtl() })] }),
                                ],
                            }));
                        });
                        
                        children.push(new Table({
                            visuallyRightToLeft: _rtl(),
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: dutyTableRows,
                        }));
                        
                        // Notes section
                        children.push(new Paragraph({ spacing: { after: 300 } }));
                        
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expNotes'),
                                    bold: true,
                                    size: 24,
                                }),
                            ],
                            spacing: { after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        const notes = [
                            'Weighted Mean = Σ(value × count) ÷ total responses',
                            'Priority Index calculated using selected formula',
                            'Higher priority values indicate greater training importance',
                            'Results based on DACUM methodology'
                        ];
                        
                        notes.forEach(note => {
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `• ${note}`,
                                        size: 20,
                                    }),
                                ],
                                spacing: { after: 100 },
                                bidirectional: _rtl(),
                            }));
                        });
                    }
                }
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxVerifiedResults({ PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, children, hasVerifiedResults }) {
  if (appState.tvExportMode === 'appendix' && hasVerifiedResults) {
                    // Page break before verified results appendix
                    children.push(new Paragraph({ children: [new PageBreak()] }));
                    
                    // Appendix title
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _t('expPostVoteResults'),
                                bold: true,
                                size: 32,
                            }),
                        ],
                        spacing: { after: 300 },
                        bidirectional: _rtl(),
                    }));
                    
                    // Metadata
                    children.push(new Paragraph({
                        children: [new TextRun({ text: _tf('expOccupation', { v: appState.lwFinalizedData.occupation }), size: 22 })],
                        spacing: { after: 100 },
                        bidirectional: _rtl(),
                    }));
                    children.push(new Paragraph({
                        children: [new TextRun({ text: _tf('expJobTitle', { v: appState.lwFinalizedData.jobTitle }), size: 22 })],
                        spacing: { after: 100 },
                        bidirectional: _rtl(),
                    }));
                    children.push(new Paragraph({
                        children: [new TextRun({ text: _tf('expDate', { v: _today() }), size: 22 })],
                        spacing: { after: 100 },
                        bidirectional: _rtl(),
                    }));
                    const vFormula = appState.lwFinalizedData.appState.priorityFormula || 'if';
                    const vFormulaText = vFormula === 'ifd' ? 'Importance × Frequency × Difficulty' : 'Importance × Frequency';
                    children.push(new Paragraph({
                        children: [new TextRun({ text: _tf('expPriorityFormula', { v: vFormulaText }), size: 22 })],
                        spacing: { after: 100 },
                        bidirectional: _rtl(),
                    }));
                    children.push(new Paragraph({
                        children: [new TextRun({ text: _tf('expTotalParticipants', { v: appState.lwAggregatedResults.totalVotes }), size: 22 })],
                        spacing: { after: 300 },
                        bidirectional: _rtl(),
                    }));
                    
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
                                    rank: task.rank
                                });
                            }
                        });
                    });
                    
                    verifiedTasks.sort((a, b) => a.rank - b.rank);
                    
                    // Create table
                    const verifiedTableRows = [
                        new TableRow({
                            children: [
                                new TableCell({ children: [new Paragraph({ text: _t('expRank'), bold: true, bidirectional: _rtl() })], width: { size: 8, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: [new Paragraph({ text: _t('expDutyLabel'), bold: true, bidirectional: _rtl() })], width: { size: 22, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: [new Paragraph({ text: _t('expTaskLabel'), bold: true, bidirectional: _rtl() })], width: { size: 35, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: [new Paragraph({ text: _t('expInitialI'), bold: true, bidirectional: _rtl() })], width: { size: 8, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: [new Paragraph({ text: _t('expInitialF'), bold: true, bidirectional: _rtl() })], width: { size: 8, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: [new Paragraph({ text: _t('expInitialD'), bold: true, bidirectional: _rtl() })], width: { size: 8, type: WidthType.PERCENTAGE } }),
                                new TableCell({ children: [new Paragraph({ text: _t('expPI'), bold: true, bidirectional: _rtl() })], width: { size: 11, type: WidthType.PERCENTAGE } })
                            ]
                        })
                    ];
                    
                    verifiedTasks.forEach(task => {
                        verifiedTableRows.push(
                            new TableRow({
                                children: [
                                    new TableCell({ children: [new Paragraph({ text: String(task.rank), bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: task.dutyTitle, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: task.taskText, bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: task.meanImportance.toFixed(2), bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: task.meanFrequency.toFixed(2), bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: task.meanDifficulty.toFixed(2), bidirectional: _rtl() })] }),
                                    new TableCell({ children: [new Paragraph({ text: task.priorityIndex.toFixed(2), bidirectional: _rtl() })] })
                                ]
                            })
                        );
                    });
                    
                    children.push(new Table({
                        visuallyRightToLeft: _rtl(),
                        rows: verifiedTableRows,
                        width: { size: 100, type: WidthType.PERCENTAGE }
                    }));
                }
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxTaskAnalysis({ AlignmentType, PageBreak, Paragraph, TextRun, children }) {
  {
                    const taData = getTaskAnalysisExportData();
                    const tsel   = getTaskSelectionExportSummary();
                    if (taData.length > 0 || tsel) {
                        children.push(new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() }));

                        children.push(new Paragraph({
                            children: [
                                new TextRun({ text: _t('expTaskAnalysisAppendix'), bold: true, size: 32 }),
                            ],
                            spacing: { before: 400, after: 400 },
                            alignment: AlignmentType.CENTER,
                            bidirectional: _rtl(),
                        }));

                        // 3.81.0: which tasks were selected for training
                        // and analysis (Task Verification), and why the
                        // others were left out.
                        if (tsel) {
                            children.push(new Paragraph({
                                children: [new TextRun({ text: _tf('expTselSummary', { n: tsel.selected, total: tsel.total }), bold: true, size: 22 })],
                                spacing: { after: 80 },
                                bidirectional: _rtl(),
                            }));
                            children.push(new Paragraph({
                                children: [new TextRun({ text: _t('expTselExcluded'), bold: true, size: 20 })],
                                spacing: { after: 60 },
                                bidirectional: _rtl(),
                            }));
                            tsel.excluded.forEach(x => {
                                children.push(new Paragraph({
                                    children: [new TextRun({ text: `${x.code} — ${x.text}${x.reason ? ' (' + x.reason + ')' : ''}`, size: 20 })],
                                    spacing: { after: 30 },
                                    indent: { left: 360 },
                                    bidirectional: _rtl(),
                                }));
                            });
                            children.push(new Paragraph({ children: [new TextRun({ text: '', size: 4 })], spacing: { after: 300 }, bidirectional: _rtl() }));
                        }

                        const _hasMarker = (s) => /^(\d+[.\)]|[•\-\*○●])\s+/.test(s);

                        // 3.46.0: a label starting with '=' is a user-added section title, used as typed.
                        const _taLbl = (labelKey) => String(labelKey).charAt(0) === '=' ? String(labelKey).slice(1) : _t(labelKey);
                        const _pushList = (labelKey, items) => {
                            if (!items || !items.length) return;
                            children.push(new Paragraph({
                                children: [new TextRun({ text: _taLbl(labelKey), bold: true, size: 22 })],
                                spacing: { before: 150, after: 60 },
                                bidirectional: _rtl(),
                            }));
                            // Respect whatever the user already chose in the
                            // app (Number/Bullet buttons bake the marker into
                            // the text itself) — only auto-number lines with
                            // no marker of their own, so a bulleted list
                            // stays bulleted instead of being double-numbered.
                            let autoNum = 0;
                            items.forEach((item) => {
                                const text = _hasMarker(item) ? item : `${++autoNum}. ${item}`;
                                children.push(new Paragraph({
                                    children: [new TextRun({ text, size: 20 })],
                                    spacing: { after: 40 },
                                    indent: { left: 360 },
                                    bidirectional: _rtl(),
                                }));
                            });
                        };

                        const _pushText = (labelKey, value) => {
                            if (!value || !value.trim()) return;
                            children.push(new Paragraph({
                                children: [new TextRun({ text: _taLbl(labelKey), bold: true, size: 22 })],
                                spacing: { before: 150, after: 60 },
                                bidirectional: _rtl(),
                            }));
                            children.push(new Paragraph({
                                children: [new TextRun({ text: value, size: 20 })],
                                spacing: { after: 100 },
                                indent: { left: 360 },
                                bidirectional: _rtl(),
                            }));
                        };

                        taData.forEach((entry, idx) => {
                            children.push(new Paragraph({
                                children: [new TextRun({
                                    text: `${_t('expDutyLabel')}: ${entry.dutyLetter} — ${entry.dutyTitle}`,
                                    italics: true, size: 18, color: '666666',
                                })],
                                spacing: { before: idx > 0 ? 300 : 0, after: 40 },
                                bidirectional: _rtl(),
                            }));

                            children.push(new Paragraph({
                                children: [new TextRun({
                                    text: `${entry.taskCode}. ${entry.taskText}`, bold: true, size: 26,
                                })],
                                spacing: { after: 120 },
                                bidirectional: _rtl(),
                            }));

                            const r = entry.record;
                            // 3.46.0: same order as the Task Analysis tab (by importance),
                            // then the sections the user added.
                            _pushList('taLblSteps',      r.performanceSteps);
                            _pushList('taLblKnowledge',  r.requiredKnowledge);
                            _pushList('taLblSkills',     r.requiredSkills);
                            _pushList('taLblCriteria',   r.performanceCriteria);
                            _pushText('taLblStandard',   r.performanceStandard);
                            _pushList('taLblTools',      r.toolsEquipmentMaterials);
                            _pushList('taLblSafety',     r.safetyOSH);
                            _pushList('taLblDecisions',  r.decisionsCriticalPoints);
                            _pushText('taLblConditions', r.conditionsWorkEnvironment);
                            _pushList('taLblErrors',     r.commonErrorsTroubleshooting);
                            (r.customSections || []).forEach(sec => _pushList('=' + sec.title, sec.items));

                            children.push(new Paragraph({
                                children: [new TextRun({ text: '', size: 4 })],
                                spacing: { after: 200 },
                                bidirectional: _rtl(),
                            }));
                        });
                    }
                }
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxClusters({ AlignmentType, PageBreak, Paragraph, TextRun, children }) {
  if (appState.clusteringData.clusters && appState.clusteringData.clusters.length > 0) {
                    children.push(new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() }));
                    
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _t('expClusters'),
                                bold: true,
                                size: 32, // 16pt
                            }),
                        ],
                        spacing: { before: 400, after: 400 },
                        alignment: AlignmentType.CENTER,
                        bidirectional: _rtl(),
                    }));
                    
                    appState.clusteringData.clusters.forEach((cluster, clusterIndex) => {
                        const clusterNumber = clusterIndex + 1;
                        
                        // Cluster header
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _tf('expCompetencyN', { n: clusterNumber, name: cluster.name }),
                                    bold: true,
                                    size: 28, // 14pt
                                }),
                            ],
                            spacing: { before: 300, after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Range section
                        if (cluster.range && cluster.range.trim()) {
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: _t('expRangeLabel'),
                                        bold: true,
                                        size: 24, // 12pt
                                    }),
                                ],
                                spacing: { before: 200, after: 100 },
                                bidirectional: _rtl(),
                            }));
                            
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: cluster.range,
                                        size: 22, // 11pt
                                    }),
                                ],
                                spacing: { after: 200 },
                                indent: { left: 720 },
                                bidirectional: _rtl(),
                            }));
                        }
                        
                        // Related Tasks section
                        if (cluster.tasks && cluster.tasks.length > 0) {
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: _t('expRelatedTasks'),
                                        bold: true,
                                        size: 24, // 12pt
                                    }),
                                ],
                                spacing: { before: 200, after: 100 },
                                bidirectional: _rtl(),
                            }));
                            
                            cluster.tasks.forEach(task => {
                                const taskCode = getTaskCode(task.id);
                                children.push(new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `- ${taskCode}: ${task.text}`,
                                            size: 22, // 11pt
                                        }),
                                    ],
                                    spacing: { after: 100 },
                                    indent: { left: 720 },
                                    bidirectional: _rtl(),
                                }));
                            });
                        }
                        
                        // Performance Criteria section
                        if (cluster.performanceCriteria && cluster.performanceCriteria.length > 0) {
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: _t('expPCLabel'),
                                        bold: true,
                                        size: 24, // 12pt
                                    }),
                                ],
                                spacing: { before: 200, after: 100 },
                                bidirectional: _rtl(),
                            }));
                            
                            cluster.performanceCriteria.forEach((criterion, idx) => {
                                children.push(new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `${clusterNumber}-${idx + 1} ${criterion}`,
                                            size: 22, // 11pt
                                        }),
                                    ],
                                    spacing: { after: 100 },
                                    indent: { left: 720 },
                                    bidirectional: _rtl(),
                                }));
                            });
                        }
                    });
                }
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxLearningOutcomes({ AlignmentType, PageBreak, Paragraph, TextRun, children }) {
  if (appState.learningOutcomesData.outcomes && appState.learningOutcomesData.outcomes.length > 0) {
                    children.push(new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() }));
                    
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _t('expLearningOutcomes'),
                                bold: true,
                                size: 32, // 16pt
                            }),
                        ],
                        spacing: { before: 400, after: 400 },
                        alignment: AlignmentType.CENTER,
                        bidirectional: _rtl(),
                    }));
                    
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
                        
                        // Cluster header
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: cluster.name,
                                    bold: true,
                                    size: 28, // 14pt
                                }),
                            ],
                            spacing: { before: 300, after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Learning Outcomes for this cluster
                        los.forEach(lo => {
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `${lo.number}:`,
                                        bold: true,
                                        size: 24, // 12pt
                                    }),
                                ],
                                spacing: { before: 200, after: 100 },
                                bidirectional: _rtl(),
                            }));
                            
                            if (lo.statement && lo.statement.trim()) {
                                children.push(new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: lo.statement,
                                            size: 22, // 11pt
                                        }),
                                    ],
                                    spacing: { after: 100 },
                                    indent: { left: 720 },
                                    bidirectional: _rtl(),
                                }));
                            }
                            
                            // Mapped Performance Criteria
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: _t('expMappedPC'),
                                        italic: true,
                                        size: 20, // 10pt
                                    }),
                                ],
                                spacing: { before: 100, after: 50 },
                                indent: { left: 720 },
                                bidirectional: _rtl(),
                            }));
                            
                            lo.linkedCriteria.forEach(pc => {
                                children.push(new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `- ${pc.id}: ${pc.text}`,
                                            size: 18, // 9pt
                                        }),
                                    ],
                                    spacing: { after: 50 },
                                    indent: { left: 1440 },
                                    bidirectional: _rtl(),
                                }));
                            });
                        });
                    });
                }
}

/* exportToWord() section, moved out unchanged (3.77.0). Receives the
   exportToWord() locals it reads; it writes none of them. */
export function _docxModules({ AlignmentType, PageBreak, Paragraph, TextRun, children }) {
  if (appState.moduleMappingData.modules && appState.moduleMappingData.modules.length > 0) {
                    children.push(new Paragraph({ children: [new PageBreak()], bidirectional: _rtl() }));
                    
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: _t('expModuleMapping'),
                                bold: true,
                                size: 32, // 16pt
                            }),
                        ],
                        spacing: { before: 400, after: 400 },
                        alignment: AlignmentType.CENTER,
                        bidirectional: _rtl(),
                    }));
                    
                    appState.moduleMappingData.modules.forEach(module => {
                        // Module title
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: moduleTitleWithLevel(module),
                                    bold: true,
                                    size: 28, // 14pt
                                }),
                            ],
                            spacing: { before: 300, after: 200 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Learning Outcomes header
                        children.push(new Paragraph({
                            children: [
                                new TextRun({
                                    text: _t('expLOsLabel'),
                                    bold: true,
                                    size: 24, // 12pt
                                }),
                            ],
                            spacing: { before: 200, after: 100 },
                            bidirectional: _rtl(),
                        }));
                        
                        // Learning Outcomes in this module
                        module.learningOutcomes.forEach(lo => {
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: `${lo.number}:`,
                                        bold: true,
                                        size: 22, // 11pt
                                    }),
                                ],
                                spacing: { before: 150, after: 50 },
                                indent: { left: 720 },
                                bidirectional: _rtl(),
                            }));
                            
                            if (lo.statement && lo.statement.trim()) {
                                children.push(new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: lo.statement,
                                            size: 20, // 10pt
                                        }),
                                    ],
                                    spacing: { after: 50 },
                                    indent: { left: 1440 },
                                    bidirectional: _rtl(),
                                }));
                            }
                            
                            // Referenced Performance Criteria
                            children.push(new Paragraph({
                                children: [
                                    new TextRun({
                                        text: _t('expReferencedPC'),
                                        italic: true,
                                        size: 18, // 9pt
                                    }),
                                ],
                                spacing: { before: 50, after: 30 },
                                indent: { left: 1440 },
                                bidirectional: _rtl(),
                            }));
                            
                            lo.linkedCriteria.forEach(pc => {
                                children.push(new Paragraph({
                                    children: [
                                        new TextRun({
                                            text: `- ${pc.id}: ${pc.text}`,
                                            size: 16, // 8pt
                                        }),
                                    ],
                                    spacing: { after: 30 },
                                    indent: { left: 2160 },
                                    bidirectional: _rtl(),
                                }));
                            });
                        });
                    });
                }
}
