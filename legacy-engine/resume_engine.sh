# Run in the Colab terminal after Run all + Drive approval. Re-patches worker, restarts builders, cleans Finished Videos.
E=/content/drive/MyDrive/everstock-media/_engine
sed -i 's/^\(\s*\)run_job(p)$/\1os.path.exists(p) and run_job(p)/' /content/engine_run/worker.py 2>/dev/null
cd $E
for s in prod_spec_v4c.json prod_spec_v5d.json prod_spec_v6.json; do
  (nohup python3 prod_build_v6.py --spec $s > /content/build_${s%.json}.log 2>&1 &)
done
python3 prod_build_v6.py --spec prod_spec_v4c.json --publish < /dev/null | grep -E 'cleanup|published' | tail -5
