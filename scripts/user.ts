// 帳號管理指令（在伺服器上執行，不經過網頁）：
//   node scripts/user.ts create-admin <帳號> [顯示名稱]   建立第一個管理員
//   node scripts/user.ts reset-password <帳號>            重設密碼（忘記密碼時用）
//   node scripts/user.ts list                             列出帳號
// 密碼用互動輸入（不會顯示、不會留在 shell 歷史或環境變數）。需要 Node 22.23.4 以上（可直接執行 .ts）。
import { createInterface } from 'node:readline';
import { AuthError, createUser, getUserByName, listUsers, setPassword } from '../src/server/auth.ts';
import { closeDb } from '../src/server/db.ts';

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = (rl as any)._writeToOutput;
    (rl as any)._writeToOutput = (s: string) => {
      if (s.startsWith(prompt)) w.call(rl, s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function askNewPassword() {
  const p1 = await askHidden('新密碼（至少 10 字元）：');
  const p2 = await askHidden('再輸入一次：');
  if (p1 !== p2) throw new AuthError('兩次輸入的密碼不一樣');
  return p1;
}

const [cmd, username, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'create-admin' && username) {
    const u = await createUser({ username, displayName: rest.join(' ') || '管理員', password: await askNewPassword(), role: 'admin', status: 'active' });
    console.log(`已建立管理員：${u.username}`);
  } else if (cmd === 'reset-password' && username) {
    const u = getUserByName(username);
    if (!u) throw new AuthError('找不到這個帳號');
    await setPassword(u.id, await askNewPassword());
    console.log(`已重設 ${u.username} 的密碼，並登出其所有裝置`);
  } else if (cmd === 'list') {
    for (const u of listUsers()) console.log(`${u.id}\t${u.username}\t${u.role}\t${u.status}\t${u.displayName}`);
  } else {
    console.log('用法：node scripts/user.ts create-admin <帳號> [顯示名稱] | reset-password <帳號> | list');
    process.exitCode = 1;
  }
} catch (e) {
  if (!(e instanceof AuthError)) throw e;
  console.error(`錯誤：${e.message}`);
  process.exitCode = 1;
} finally {
  closeDb();
}
