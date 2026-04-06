import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import "./styles.css";

const STORAGE_KEYS = {
  fileRows: "filaLigacoes_rows_v6",
  doneMapByAgent: "filaLigacoes_doneMap_v6",
  selectedAgent: "filaLigacoes_selectedAgent_v6",
  accessMode: "filaLigacoes_accessMode_v6",
};

const MANAGER_TEAMS = [
  "Team A",
  "Team B",
  "Team C",
  "Team E",
  "Team F",
  "Team G",
];

function normalizeTeamName(value) {
  const team = String(value || "").trim();

  if (team.includes("Team A")) return "Team A";
  if (team.includes("Team B")) return "Team B";
  if (team.includes("Team C")) return "Team C";
  if (team.includes("Team E")) return "Team E";
  if (team.includes("Team F")) return "Team F";
  if (team.includes("Team G")) return "Team G";

  return team || "-";
}

function getPriority(score) {
  if (score >= 100) return "Ligar agora";
  if (score >= 70) return "Alta";
  if (score >= 40) return "Media";
  return "Baixa";
}

function getPriorityClass(priority) {
  if (priority === "Ligar agora") return "priority-now";
  if (priority === "Alta") return "priority-high";
  if (priority === "Media") return "priority-medium";
  return "priority-low";
}

function getMarginValue(row) {
  return Number(
    row["Margin %"] ||
      row["Margin"] ||
      row["Margin Level"] ||
      row["Margin Level %"] ||
      row["Margin EOD"] ||
      0
  );
}

function getProtectedValue(row) {
  return Number(row["Protected Positions Left"] || 0);
}

function scoreRow(row) {
  let score = 0;
  const reasons = [];

  const margin = getMarginValue(row);
  const protectedPositions = getProtectedValue(row);
  const withdrawable = Number(row["Withdrawable EquityUSD"] || 0);
  const equity = Number(row["Account Equity USD"] || 0);
  const activity7d = Number(row["Last 7d AVG Opened Positions"] || 0);
  const lastDepositDate = row["Last Deposit Date"];
  const hasDeposit = !!lastDepositDate;

  if (margin >= 0.01 && margin <= 1.5) {
    score += 120;
    reasons.push("Margem crítica - risco de liquidação");
  }

  if (withdrawable > 0) {
    score += 95;
    reasons.push("WD Equity positivo - trabalhar retenção");
  }

  if (equity >= 3000 && activity7d > 6) {
    score += 80;
    reasons.push("Bom Account Equity + atividade alta 7D");
  }

  if (hasDeposit && protectedPositions > 0) {
    score += 70;
    reasons.push("FTD com protegidas");
  }

  if (margin >= 1.6 && margin <= 3) {
    score += 45;
    reasons.push("Margem ideal - monitorar");
  }

  if (margin > 3) {
    score += 25;
    reasons.push("Margem alta - expor cliente");
  }

  if (reasons.length === 0) {
    reasons.push("Acompanhamento");
  }

  return {
    client: row["User Name"] || "-",
    agent: row["Agent"] || "-",
    team: normalizeTeamName(row["Team"]),
    userId: String(row["UserId"] || "-"),
    score,
    reason: reasons.join(" | "),
    priority: getPriority(score),
    margin,
    withdrawable,
    equity,
    activity7d,
    protectedPositions,
    hasDeposit,
  };
}

export default function App() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [accessMode, setAccessMode] = useState("");
  const [doneMapByAgent, setDoneMapByAgent] = useState({});
  const [managerViewTeam, setManagerViewTeam] = useState("");
  const [managerViewAgent, setManagerViewAgent] = useState("");

  useEffect(() => {
    try {
      const savedRows = localStorage.getItem(STORAGE_KEYS.fileRows);
      const savedDone = localStorage.getItem(STORAGE_KEYS.doneMapByAgent);
      const savedAgent = localStorage.getItem(STORAGE_KEYS.selectedAgent);
      const savedMode = localStorage.getItem(STORAGE_KEYS.accessMode);

      if (savedRows) setData(JSON.parse(savedRows));
      if (savedDone) setDoneMapByAgent(JSON.parse(savedDone));
      if (savedAgent) setSelectedAgent(savedAgent);
      if (savedMode) setAccessMode(savedMode);
    } catch (error) {
      console.error("Erro ao carregar dados salvos:", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.fileRows, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEYS.doneMapByAgent,
      JSON.stringify(doneMapByAgent)
    );
  }, [doneMapByAgent]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.selectedAgent, selectedAgent);
  }, [selectedAgent]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.accessMode, accessMode);
  }, [accessMode]);

  const handleFile = (file) => {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: "binary" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      console.log("Colunas do Excel:", Object.keys(json[0] || {}));

      const ranked = json.map(scoreRow).sort((a, b) => b.score - a.score);
      setData(ranked);
    };

    reader.readAsBinaryString(file);
  };

  const agents = useMemo(() => {
    return [...new Set(data.map((d) => d.agent))].filter(Boolean).sort();
  }, [data]);

  const currentAgent =
    accessMode === "agente" ? selectedAgent : managerViewAgent;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();

    return data.filter((row) => {
      const agentDoneMap = doneMapByAgent[row.agent] || {};
      if (agentDoneMap[row.userId]) return false;

      if (accessMode === "gestor") {
        if (!managerViewTeam || !managerViewAgent) return false;
        if (row.team !== managerViewTeam) return false;
        if (row.agent !== managerViewAgent) return false;
      } else {
        if (!currentAgent) return false;
        if (row.agent !== currentAgent) return false;
      }

      return (
        row.client.toLowerCase().includes(term) ||
        row.userId.toLowerCase().includes(term) ||
        row.reason.toLowerCase().includes(term)
      );
    });
  }, [
    data,
    search,
    currentAgent,
    doneMapByAgent,
    accessMode,
    managerViewTeam,
    managerViewAgent,
  ]);

  const historyRows = useMemo(() => {
    if (accessMode === "gestor") {
      if (!managerViewTeam || !managerViewAgent) return [];
      return data.filter((row) => {
        const agentDoneMap = doneMapByAgent[row.agent] || {};
        return (
          row.team === managerViewTeam &&
          row.agent === managerViewAgent &&
          !!agentDoneMap[row.userId]
        );
      });
    }

    const agentDoneMap = doneMapByAgent[currentAgent] || {};
    return data.filter(
      (row) => row.agent === currentAgent && !!agentDoneMap[row.userId]
    );
  }, [
    data,
    doneMapByAgent,
    accessMode,
    managerViewTeam,
    managerViewAgent,
    currentAgent,
  ]);

  const managerSummary = useMemo(() => {
    return MANAGER_TEAMS.map((team) => {
      const teamRows = data.filter((row) => row.team === team);

      const ligadosNoTime = teamRows.filter((row) => {
        const agentDoneMap = doneMapByAgent[row.agent] || {};
        return !!agentDoneMap[row.userId];
      }).length;

      const pendingRows = teamRows.filter((row) => {
        const agentDoneMap = doneMapByAgent[row.agent] || {};
        return !agentDoneMap[row.userId];
      });

      return {
        team,
        pendentes: pendingRows.length,
        ligados: ligadosNoTime,
        margemCritica: pendingRows.filter(
          (row) => row.margin >= 0.01 && row.margin <= 1.5
        ).length,
        wdPositivo: pendingRows.filter((row) => row.withdrawable > 0).length,
        protegidas: pendingRows.filter((row) => row.protectedPositions > 0)
          .length,
        altaPrioridade: pendingRows.filter(
          (row) => row.priority === "Ligar agora" || row.priority === "Alta"
        ).length,
      };
    });
  }, [data, doneMapByAgent]);

  const managerAgentSummary = useMemo(() => {
    if (!managerViewTeam) return [];

    const teamRows = data.filter((row) => row.team === managerViewTeam);
    const teamAgents = [...new Set(teamRows.map((row) => row.agent))]
      .filter(Boolean)
      .sort();

    return teamAgents.map((agent) => {
      const agentRows = teamRows.filter((row) => row.agent === agent);
      const agentDoneMap = doneMapByAgent[agent] || {};
      const pendingRows = agentRows.filter((row) => !agentDoneMap[row.userId]);

      return {
        agent,
        pendentes: pendingRows.length,
        ligados: Object.keys(agentDoneMap).length,
        margemCritica: pendingRows.filter(
          (row) => row.margin >= 0.01 && row.margin <= 1.5
        ).length,
        wdPositivo: pendingRows.filter((row) => row.withdrawable > 0).length,
        protegidas: pendingRows.filter((row) => row.protectedPositions > 0)
          .length,
        altaPrioridade: pendingRows.filter(
          (row) => row.priority === "Ligar agora" || row.priority === "Alta"
        ).length,
      };
    });
  }, [data, doneMapByAgent, managerViewTeam]);

  const totalPendentes = useMemo(() => {
    return managerSummary.reduce((acc, item) => acc + item.pendentes, 0);
  }, [managerSummary]);

  const totalLigados = useMemo(() => {
    return managerSummary.reduce((acc, item) => acc + item.ligados, 0);
  }, [managerSummary]);

  const totalMargemCritica = useMemo(() => {
    return managerSummary.reduce((acc, item) => acc + item.margemCritica, 0);
  }, [managerSummary]);

  const totalWdPositivo = useMemo(() => {
    return managerSummary.reduce((acc, item) => acc + item.wdPositivo, 0);
  }, [managerSummary]);

  const totalProtegidas = useMemo(() => {
    return managerSummary.reduce((acc, item) => acc + item.protegidas, 0);
  }, [managerSummary]);

  const doneCount = useMemo(() => historyRows.length, [historyRows]);

  const criticalMarginCount = useMemo(() => {
    return filtered.filter((row) => row.margin >= 0.01 && row.margin <= 1.5)
      .length;
  }, [filtered]);

  const wdPositiveCount = useMemo(() => {
    return filtered.filter((row) => row.withdrawable > 0).length;
  }, [filtered]);

  const protectedCount = useMemo(() => {
    return filtered.filter((row) => row.protectedPositions > 0).length;
  }, [filtered]);

  const markDone = (id, agent) => {
    const confirmed = window.confirm(
      "Confirmar que voce ja ligou para este cliente?"
    );
    if (!confirmed || !agent) return;

    setDoneMapByAgent((prev) => ({
      ...prev,
      [agent]: {
        ...(prev[agent] || {}),
        [id]: true,
      },
    }));
  };

  const undoDone = (id, agent) => {
    if (!agent) return;

    setDoneMapByAgent((prev) => {
      const updatedAgentMap = { ...(prev[agent] || {}) };
      delete updatedAgentMap[id];

      return {
        ...prev,
        [agent]: updatedAgentMap,
      };
    });
  };

  const exportExcel = () => {
    const exportRows = filtered.map((row) => ({
      Prioridade: row.priority,
      Score: row.score,
      Cliente: row.client,
      UserID: row.userId,
      Team: row.team,
      Motivo: row.reason,
      Agente: row.agent,
      Margem: row.margin,
      WDEquity: row.withdrawable,
      AccountEquity: row.equity,
      Operacoes7D: row.activity7d,
      ProtectedPositionsLeft: row.protectedPositions,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fila");

    const fileName =
      accessMode === "gestor"
        ? `fila_${managerViewAgent || "gestor"}.xlsx`
        : `fila_${currentAgent || "agente"}.xlsx`;

    XLSX.writeFile(wb, fileName);
  };

  const exportManagerExcel = () => {
    const ws = XLSX.utils.json_to_sheet(managerSummary);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumo Gestor");
    XLSX.writeFile(wb, "resumo_gestor_times.xlsx");
  };

  const clearHistoryForCurrentView = () => {
    const confirmed = window.confirm(
      "Apagar o historico de 'Ja liguei' desta visualizacao?"
    );
    if (!confirmed) return;

    if (accessMode === "gestor") {
      if (managerViewAgent) {
        setDoneMapByAgent((prev) => ({
          ...prev,
          [managerViewAgent]: {},
        }));
      }
    } else {
      setDoneMapByAgent((prev) => ({
        ...prev,
        [currentAgent]: {},
      }));
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="app">
        <div className="login-box">
          <h2 className="login-title">Entrada no sistema</h2>
          <p className="login-subtitle">
            Carregue o reporte e escolha se vai entrar como agente ou gestor.
          </p>

          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <div className="spacer" />

          <select
            value={accessMode}
            onChange={(e) => setAccessMode(e.target.value)}
          >
            <option value="">Selecione o modo</option>
            <option value="agente">Entrar como agente</option>
            <option value="gestor">Entrar como gestor</option>
          </select>

          <div className="spacer" />

          {accessMode === "agente" && (
            <>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="">Selecione o agente</option>
                {agents.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              <div className="spacer" />
            </>
          )}

          <button
            onClick={() => {
              if (accessMode === "gestor") {
                setManagerViewTeam("");
                setManagerViewAgent("");
                setIsLoggedIn(true);
              } else if (accessMode === "agente" && selectedAgent) {
                setIsLoggedIn(true);
              }
            }}
            disabled={
              !accessMode || (accessMode === "agente" && !selectedAgent)
            }
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  if (accessMode === "gestor" && !managerViewTeam) {
    return (
      <div className="app">
        <div className="header">
          <h1 className="title">Painel do Gestor</h1>
          <p className="subtitle">
            Visão geral por TEAM, risco, WD positivo e posições protegidas.
          </p>
        </div>

        <div className="topbar">
          <div className="actions-row">
            <button className="secondary" onClick={() => setIsLoggedIn(false)}>
              Voltar
            </button>
            <button onClick={exportManagerExcel}>Exportar resumo</button>
          </div>
        </div>

        <div className="card-row">
          <div className="card">
            <div className="card-label">Pendentes totais</div>
            <div className="card-value">{totalPendentes}</div>
          </div>

          <div className="card">
            <div className="card-label">Ja ligados</div>
            <div className="card-value">{totalLigados}</div>
          </div>

          <div className="card">
            <div className="card-label">Margem critica</div>
            <div className="card-value">{totalMargemCritica}</div>
          </div>

          <div className="card">
            <div className="card-label">WD positivo</div>
            <div className="card-value">{totalWdPositivo}</div>
          </div>

          <div className="card">
            <div className="card-label">Protected Positions Left</div>
            <div className="card-value">{totalProtegidas}</div>
          </div>
        </div>

        <div className="panel table-wrap manager-highlight">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Pendentes</th>
                <th>Ja ligados</th>
                <th>Margem critica</th>
                <th>WD positivo</th>
                <th>Protected Positions Left</th>
                <th>Alta prioridade</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {managerSummary.map((item) => (
                <tr key={item.team}>
                  <td>{item.team}</td>
                  <td>{item.pendentes}</td>
                  <td>{item.ligados}</td>
                  <td>{item.margemCritica}</td>
                  <td>{item.wdPositivo}</td>
                  <td>{item.protegidas}</td>
                  <td>{item.altaPrioridade}</td>
                  <td>
                    <button
                      className="success"
                      onClick={() => {
                        setManagerViewTeam(item.team);
                        setManagerViewAgent("");
                      }}
                    >
                      Ver time
                    </button>
                  </td>
                </tr>
              ))}

              {!managerSummary.length && (
                <tr>
                  <td colSpan="8" className="empty-row">
                    Sem dados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (accessMode === "gestor" && managerViewTeam && !managerViewAgent) {
    return (
      <div className="app">
        <div className="header">
          <h1 className="title">Agentes do {managerViewTeam}</h1>
          <p className="subtitle">
            Escolha um agente para abrir a carteira detalhada.
          </p>
        </div>

        <div className="topbar">
          <div className="agent-box">
            <div className="card-label">TEAM selecionado</div>
            <div className="agent-name">{managerViewTeam}</div>
          </div>

          <div className="actions-row">
            <button
              className="secondary"
              onClick={() => {
                setManagerViewTeam("");
                setManagerViewAgent("");
              }}
            >
              Voltar aos teams
            </button>
          </div>
        </div>

        <div className="panel table-wrap manager-highlight">
          <table>
            <thead>
              <tr>
                <th>Agente</th>
                <th>Pendentes</th>
                <th>Ja ligados</th>
                <th>Margem critica</th>
                <th>WD positivo</th>
                <th>Protected Positions Left</th>
                <th>Alta prioridade</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {managerAgentSummary.map((item) => (
                <tr key={item.agent}>
                  <td>{item.agent}</td>
                  <td>{item.pendentes}</td>
                  <td>{item.ligados}</td>
                  <td>{item.margemCritica}</td>
                  <td>{item.wdPositivo}</td>
                  <td>{item.protegidas}</td>
                  <td>{item.altaPrioridade}</td>
                  <td>
                    <button
                      className="success"
                      onClick={() => setManagerViewAgent(item.agent)}
                    >
                      Ver carteira
                    </button>
                  </td>
                </tr>
              ))}

              {!managerAgentSummary.length && (
                <tr>
                  <td colSpan="8" className="empty-row">
                    Sem agentes neste team
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <h1 className="title">
          {accessMode === "gestor" ? "Carteira do agente" : "Fila Profissional"}
        </h1>
        <p className="subtitle">
          {accessMode === "gestor"
            ? "Visão detalhada da carteira do agente escolhido pelo gestor."
            : "Priorização estilo mesa de trading por risco, WD, equity, atividade e protegidas."}
        </p>
      </div>

      <div className="topbar">
        <div className="agent-box">
          <div className="card-label">
            {accessMode === "gestor" ? "Agente selecionado" : "Agente logado"}
          </div>
          <div className="agent-name">
            {accessMode === "gestor" ? managerViewAgent : currentAgent}
          </div>
        </div>

        <div className="actions-row">
          {accessMode === "gestor" ? (
            <button
              className="secondary"
              onClick={() => setManagerViewAgent("")}
            >
              Voltar aos agentes
            </button>
          ) : (
            <button className="secondary" onClick={() => setIsLoggedIn(false)}>
              Trocar agente
            </button>
          )}

          <button className="danger" onClick={clearHistoryForCurrentView}>
            Limpar historico
          </button>
        </div>
      </div>

      <div className="card-row">
        <div className="card">
          <div className="card-label">Clientes pendentes</div>
          <div className="card-value">{filtered.length}</div>
        </div>

        <div className="card">
          <div className="card-label">Ja ligados</div>
          <div className="card-value">{doneCount}</div>
        </div>

        <div className="card">
          <div className="card-label">Margem critica</div>
          <div className="card-value">{criticalMarginCount}</div>
        </div>

        <div className="card">
          <div className="card-label">WD positivo</div>
          <div className="card-value">{wdPositiveCount}</div>
        </div>

        <div className="card">
          <div className="card-label">Protected Positions Left</div>
          <div className="card-value">{protectedCount}</div>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />

          <input
            type="text"
            placeholder="Buscar cliente, ID ou motivo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button onClick={exportExcel}>Exportar</button>
        </div>
      </div>

      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Prioridade</th>
              <th>Score</th>
              <th>Cliente</th>
              <th>User ID</th>
              <th>Team</th>
              <th>Margem</th>
              <th>WD Equity</th>
              <th>Account Equity</th>
              <th>7D Ops</th>
              <th>Protected Positions Left</th>
              <th>Motivo</th>
              <th>Acao</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((row, i) => (
              <tr
                key={`${row.userId}-${i}`}
                className={
                  row.margin <= 1.5
                    ? "critical-row"
                    : row.withdrawable > 0
                    ? "warning-row"
                    : ""
                }
              >
                <td className={getPriorityClass(row.priority)}>
                  {row.margin <= 1.5 && "⚠️ "}
                  {row.withdrawable > 0 && "💰 "}
                  {row.priority}
                </td>
                <td>
                  <span
                    className="badge"
                    style={{
                      background:
                        row.score > 150
                          ? "#dc2626"
                          : row.score > 100
                          ? "#f59e0b"
                          : "#e2e8f0",
                      color: row.score > 100 ? "white" : "black",
                    }}
                  >
                    {row.score}
                  </span>
                </td>
                <td>{row.client}</td>
                <td>{row.userId}</td>
                <td>{row.team}</td>
                <td>{row.margin || "-"}</td>
                <td>{row.withdrawable}</td>
                <td>{row.equity}</td>
                <td>{row.activity7d}</td>
                <td>{row.protectedPositions}</td>
                <td style={{ minWidth: "320px" }}>{row.reason}</td>
                <td>
                  <button
                    className="success"
                    onClick={() => markDone(row.userId, row.agent)}
                  >
                    Ja liguei
                  </button>
                </td>
              </tr>
            ))}

            {!filtered.length && (
              <tr>
                <td colSpan="12" className="empty-row">
                  Sem clientes
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!!historyRows.length && (
        <div className="panel table-wrap">
          <h3 className="history-title">
            Historico salvo de{" "}
            {accessMode === "gestor" ? managerViewAgent : currentAgent}
          </h3>

          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>User ID</th>
                <th>Agente</th>
                <th>Team</th>
                <th>Acao</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map((row) => (
                <tr key={`${row.agent}-${row.userId}`}>
                  <td>{row.client}</td>
                  <td>{row.userId}</td>
                  <td>{row.agent}</td>
                  <td>{row.team}</td>
                  <td>
                    <button
                      className="secondary"
                      onClick={() => undoDone(row.userId, row.agent)}
                    >
                      Desfazer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
